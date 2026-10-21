import mongoose from "mongoose";
import Usuario from "../models/Usuario.js";

import {
  diaCaja,
  tocarDias,
  confirmarTransaccion,
  traducirErrorTransaccion
} from "./transaccionCaja.js";

export function fallo(estado, mensaje) {
  const error = new Error(mensaje);
  error.estado = estado;
  return error;
}

export function responderFallo(res, error) {
  const estado = error.estado || 500;

  const mensaje = estado === 500
    ? "No se pudo comprobar o guardar la caja"
    : error.message;

  return res.status(estado).json({
    ok: false,
    mensaje,
    msg: mensaje,
    error: mensaje
  });
}

export function validarSede(sede) {
  if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
    throw fallo(400, "Sede inválida");
  }

  return sede;
}

export function diaComercial(fecha) {
  return diaCaja(fecha);
}

export function filtroDia(fecha, sede) {
  const dia = diaComercial(fecha);

  validarSede(sede);

  const inicio = new Date(`${dia}T00:00:00.000Z`);
  const fin = new Date(inicio.getTime() + 86400000);

  return {
    $and: [
      // Excluir los controles internos del arqueo.
      {
        tipoRegistro: {
          $ne: "CONTROL_DIA"
        }
      },
      {
        $or: [
          { fecha: { $gte: inicio, $lt: fin } },
          { fecha: dia },
          { fecha: { $regex: `^${dia}T` } }
        ]
      },
      sede === "MONASTERIO"
        ? { sede }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          }
    ]
  };
}

export function coleccionesCaja() {
  if (!mongoose.connection.db) {
    throw fallo(
      503,
      "La base de datos no está disponible"
    );
  }

  return ["caja", "cajas"].map(nombre =>
    mongoose.connection.db.collection(nombre)
  );
}

export async function registrosCaja(
  fecha,
  sede,
  session
) {
  const filtro = filtroDia(fecha, sede);
  const listas = [];

  // Ejecutar en orden cuando se comparte una transacción.
  for (const coleccion of coleccionesCaja()) {
    const registros = await coleccion
      .find(filtro, { session })
      .toArray();

    listas.push(registros);
  }

  return listas.flat();
}

export async function comprobarAbierta(
  fecha,
  sede,
  session
) {
  const registros = await registrosCaja(
    fecha,
    sede,
    session
  );

  if (registros.some(caja => caja.verificado === true)) {
    throw fallo(
      423,
      `El dinero del ${diaComercial(fecha)} en ${sede} ` +
      "ya fue verificado. El administrador debe " +
      "reabrir el día para realizar cambios."
    );
  }
}
export async function autenticar(req, res, next) {
  try {
    if (!req.session?.usuarioId) {
      throw fallo(401, "Debe iniciar sesión");
    }

    const user = await Usuario.findById(
      req.session.usuarioId
    ).select("-clave");

    if (!user) {
      throw fallo(401, "La sesión ya no es válida");
    }

    req.usuarioCaja = user;

    return next();
  } catch (error) {
    return responderFallo(res, error);
  }
}

export function comprobarAcceso(req, sede) {
  validarSede(sede);

  const user = req.usuarioCaja;

  if (!user) {
    throw fallo(401, "Debe iniciar sesión");
  }

  const permitido = sede === "MONASTERIO"
    ? user.accesoMonasterio === true
    : user.accesoTiendita !== false;

  if (!permitido) {
    throw fallo(403, "No tiene acceso a esta sede");
  }
}

export function exigirAdministrador(req) {
  if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
    throw fallo(
      403,
      "Solo el administrador puede verificar o reabrir el día"
    );
  }
}
export function protegerEscrituras(
  resolver,
  { permitirVerificada = false } = {}
) {
  return async (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    return autenticar(req, res, async () => {
      let session;
      let respuesta;
      let alCerrar;
      let alAbortar;

      const jsonOriginal = res.json;

      try {
        session = await mongoose.connection.startSession();

        session.startTransaction({
          readConcern: {
            level: "snapshot"
          },
          writeConcern: {
            w: "majority"
          }
        });

        req.cajaMongo = session;

        const alcances = await resolver(req);

        if (!alcances.length) {
          throw fallo(
            409,
            "No se pudo determinar la fecha de la operación"
          );
        }

        const vistos = new Set();

        for (const alcance of alcances) {
          const sede = alcance.sede || "TIENDITA";
          const dia = diaComercial(alcance.fecha);
          const clave = `${sede}:${dia}`;

          if (vistos.has(clave)) continue;

          vistos.add(clave);
          comprobarAcceso(req, sede);
        }

        req.revisionesCaja = await tocarDias(
          alcances,
          session
        );

        if (!permitirVerificada) {
          for (const alcance of alcances) {
            await comprobarAbierta(
              alcance.fecha,
              alcance.sede || "TIENDITA",
              session
            );
          }
        }

        // Retener la respuesta hasta confirmar o revertir
        // todas las escrituras de la operación.
        respuesta = await new Promise((resolve, reject) => {
          let respondido = false;

          res.json = function (datos) {
            if (!respondido) {
              respondido = true;

              resolve({
                estado: res.statusCode,
                datos
              });
            }

            return this;
          };

          alCerrar = () => {
            if (!respondido) {
              reject(
                fallo(
                  499,
                  "La conexión se cerró antes de completar la operación"
                )
              );
            }
          };

          alAbortar = alCerrar;

          res.once("close", alCerrar);
          req.once("aborted", alAbortar);

          try {
            next();
          } catch (error) {
            reject(error);
          }
        });

        if (respuesta.estado >= 400) {
          await session.abortTransaction();
        } else {
          await confirmarTransaccion(session);
        }
      } catch (error) {
        if (session?.inTransaction()) {
          try {
            await session.abortTransaction();
          } catch {
            // Conservar el error original.
          }
        }

        const traducido = traducirErrorTransaccion(error);

        const mensaje = traducido.estado
          ? traducido.message
          : "No se pudo completar la operación";

        respuesta = {
          estado: traducido.estado || 500,
          datos: {
            ok: false,
            mensaje,
            msg: mensaje,
            error: mensaje
          }
        };
      } finally {
        if (alCerrar) {
          res.removeListener("close", alCerrar);
        }

        if (alAbortar) {
          req.removeListener("aborted", alAbortar);
        }

        res.json = jsonOriginal;

        if (session) {
          try {
            await session.endSession();
          } catch {
            // No alterar una confirmación ya realizada.
          }
        }

        delete req.cajaMongo;
      }

      if (res.destroyed || res.headersSent) return;

      return res
        .status(respuesta.estado)
        .json(respuesta.datos);
    });
  };
}