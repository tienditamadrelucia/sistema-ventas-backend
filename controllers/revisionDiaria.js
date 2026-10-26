import mongoose from "mongoose";
import Ventas from "../models/dbVentas.js";
import Moneda from "../models/dbMoneda.js";
import Gastos from "../models/dbGastos.js";
import Usuario from "../models/Usuario.js";

import {
  exigirAdministrador,
  comprobarAcceso,
  diaComercial,
  coleccionesCaja,
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

import {
  traducirErrorTransaccion
} from "../utils/transaccionCaja.js";

const UN_DIA = 86400000;

function fechaValida(valor) {
  if (!valor) return null;

  const fecha = new Date(valor);

  return Number.isFinite(fecha.getTime())
    ? fecha.toISOString()
    : null;
}

export async function obtenerRevisionDiaria(req, res) {
  let session;

  try {
    exigirAdministrador(req);

    const desde = diaComercial(req.query.desde);
    const hasta = diaComercial(req.query.hasta);
    const sede = req.query.sede || "TIENDITA";
    const estado = req.query.estado || "TODOS";

    if (
      !["TIENDITA", "MONASTERIO", "AMBAS"].includes(sede)
    ) {
      throw fallo(400, "Sede inválida.");
    }

    if (
      ![
        "TODOS",
        "BLOQUEADO",
        "PENDIENTE",
        "SIN_MOVIMIENTOS"
      ].includes(estado)
    ) {
      throw fallo(400, "Estado inválido.");
    }

    if (desde > hasta) {
      throw fallo(
        400,
        "La fecha desde no puede ser posterior a hasta."
      );
    }

    const inicio = new Date(`${desde}T00:00:00.000Z`);

    const fin = new Date(
      new Date(`${hasta}T00:00:00.000Z`).getTime() + UN_DIA
    );

    if ((fin - inicio) / UN_DIA > 366) {
      throw fallo(
        400,
        "Consulte un máximo de 366 días por vez."
      );
    }

    const sedes =
      sede === "AMBAS"
        ? ["TIENDITA", "MONASTERIO"]
        : [sede];

    for (const seleccion of sedes) {
      comprobarAcceso(req, seleccion);
    }

    const filtroSedes =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: { $in: sedes } },
              { sede: { $exists: false } }
            ]
          };

    session = await mongoose.connection.startSession();

    let resultado;

    await session.withTransaction(
      async () => {
        // Crear una fila por cada día y sede consultados.
        const dias = new Map();

        for (
          let instante = inicio.getTime();
          instante < fin.getTime();
          instante += UN_DIA
        ) {
          const fecha = new Date(instante)
            .toISOString()
            .slice(0, 10);

          for (const seleccion of sedes) {
            dias.set(`${seleccion}:${fecha}`, {
              fecha,
              sede: seleccion,
              estado: "SIN_MOVIMIENTOS",
              verificado: false,
              verificadoPor: null,
              fechaVerificacion: null,
              ventas: 0,
              movimientos: 0,
              gastos: 0,
              registrosCaja: 0
            });
          }
        }

        // Contar registros por día sin cargar sus importes.
        const contarDias = async (Modelo) =>
          Modelo.aggregate([
            {
              $match: {
                fecha: {
                  $gte: inicio,
                  $lt: fin
                },
                ...filtroSedes
              }
            },
            {
              $group: {
                _id: {
                  fecha: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$fecha",
                      timezone: "UTC"
                    }
                  },
                  sede: {
                    $ifNull: ["$sede", "TIENDITA"]
                  }
                },
                cantidad: {
                  $sum: 1
                }
              }
            },
            {
              $project: {
                _id: 0,
                fecha: "$_id.fecha",
                sede: "$_id.sede",
                cantidad: 1
              }
            }
          ]).session(session);

        const ventas = await contarDias(Ventas);
        const movimientos = await contarDias(Moneda);
        const gastos = await contarDias(Gastos);

        const fuentes = [
          [ventas, "ventas"],
          [movimientos, "movimientos"],
          [gastos, "gastos"]
        ];

        for (const [registros, campo] of fuentes) {
          for (const registro of registros) {
            const clave =
              `${registro.sede}:${registro.fecha}`;

            const dia = dias.get(clave);

            if (dia) {
              dia[campo] += registro.cantidad;
            }
          }
        }

        // Consultar las mismas colecciones que utiliza
        // actualmente el bloqueo: caja y cajas.
        const cajas = [];

        const diaSiguiente = fin
          .toISOString()
          .slice(0, 10);

        const filtroCajas = {
          $and: [
            filtroSedes,
            {
              tipoRegistro: {
                $ne: "CONTROL_DIA"
              }
            },
            {
              $or: [
                {
                  fecha: {
                    $gte: inicio,
                    $lt: fin
                  }
                },
                {
                  fecha: {
                    $gte: desde,
                    $lt: diaSiguiente
                  }
                }
              ]
            }
          ]
        };

        for (const coleccion of coleccionesCaja()) {
          const registros = await coleccion
            .find(filtroCajas, {
              session,
              projection: {
                fecha: 1,
                sede: 1,
                verificado: 1,
                verificadoPor: 1,
                fechaVerificacion: 1
              }
            })
            .toArray();

          cajas.push(...registros);
        }

        const idsUsuarios = [
          ...new Set(
            cajas
              .map((caja) =>
                caja.verificadoPor
                  ? String(caja.verificadoPor)
                  : ""
              )
              .filter((valor) =>
                /^[a-f\d]{24}$/i.test(valor)
              )
          )
        ];

        const usuarios = idsUsuarios.length
          ? await Usuario.find({
              _id: {
                $in: idsUsuarios
              }
            })
              .select("nombre usuario")
              .session(session)
              .lean()
          : [];

        const nombres = new Map(
          usuarios.map((usuario) => [
            String(usuario._id),
            usuario.nombre || usuario.usuario
          ])
        );

        for (const caja of cajas) {
          const fecha = diaComercial(caja.fecha);
          const sedeCaja = caja.sede || "TIENDITA";

          const dia = dias.get(`${sedeCaja}:${fecha}`);

          if (!dia) continue;

          dia.registrosCaja++;

          if (caja.verificado !== true) continue;

          const fechaVerificacion = fechaValida(
            caja.fechaVerificacion
          );

          // Si hay varios registros, conservar los datos
          // de la verificación más reciente disponible.
          if (
            !dia.verificado ||
            (fechaVerificacion || "") >
              (dia.fechaVerificacion || "")
          ) {
            dia.verificadoPor = caja.verificadoPor
              ? nombres.get(String(caja.verificadoPor)) ||
                "Usuario no disponible"
              : "No registrado";

            dia.fechaVerificacion = fechaVerificacion;
          }

          // Coincidir con el bloqueo existente:
          // basta una caja verificada para bloquear el día.
          dia.verificado = true;
        }

        const resumen = {
          bloqueados: 0,
          pendientes: 0,
          sinMovimientos: 0
        };

        const lista = [...dias.values()];

        for (const dia of lista) {
          if (dia.verificado) {
            dia.estado = "BLOQUEADO";
            resumen.bloqueados++;
          } else if (
            dia.ventas > 0 ||
            dia.movimientos > 0 ||
            dia.gastos > 0 ||
            dia.registrosCaja > 0
          ) {
            dia.estado = "PENDIENTE";
            resumen.pendientes++;
          } else {
            resumen.sinMovimientos++;
          }
        }

        resultado = {
          resumen,
          dias:
            estado === "TODOS"
              ? lista
              : lista.filter(
                  (dia) => dia.estado === estado
                )
        };
      },
      {
        readConcern: {
          level: "snapshot"
        },
        writeConcern: {
          w: "majority"
        }
      }
    );

    return res.json({
      ok: true,
      desde,
      hasta,
      sede,
      estado,
      ...resultado
    });
  } catch (error) {
    return responderFallo(
      res,
      traducirErrorTransaccion(error)
    );
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Conservar el resultado de la consulta.
      }
    }
  }
}