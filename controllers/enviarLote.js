import mongoose from "mongoose";
import { createHash } from "node:crypto";
import EnvioLote from "../models/EnvioLote.js";
import LoteCrianza from "../models/LoteCrianza.js";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import {
  comprobarAcceso,
  comprobarAbierta,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  consultarSaldoLote,
  normalizarDetalleRetiroLote,
  validarFechaMovimientoLote
} from "./consumoLote.js";

function firmaEnvio(datos) {
  return JSON.stringify({
    fecha: diaComercial(datos.fechaEnvio),
    observaciones: datos.observacionesEnvio || "",

    detalles: normalizarDetalleRetiroLote(
      datos.detalles.map((detalle) => ({
        productoId:
          detalle.productoOrigenId ?? detalle.productoId,

        pesoKg:
          detalle.pesoEnviadoKg ?? detalle.pesoKg,

        cantidadPresentaciones:
          detalle.presentacionesEnviadas ??
          detalle.cantidadPresentaciones ??
          null
      }))
    )
  });
}

async function siguienteNumero(fecha, session) {
  const coleccion = mongoose.connection.db.collection(
    "secuencias_envios_lote"
  );

  const anio = diaComercial(fecha).slice(0, 4);
  const _id = `ENVIO_LOTE:${anio}`;

  await coleccion.updateOne(
    { _id },
    { $inc: { numero: 1 } },
    { upsert: true, session }
  );

  const contador = await coleccion.findOne(
    { _id },
    { session }
  );

  if (
    !Number.isSafeInteger(contador?.numero) ||
    contador.numero <= 0
  ) {
    throw fallo(
      500,
      "No se pudo asignar el número de envío."
    );
  }

  return (
    `ENV-${anio}-` +
    String(contador.numero).padStart(6, "0")
  );
}

export async function registrarEnvioLote(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
      throw fallo(
        400,
        "El lote indicado no es válido."
      );
    }

    const datos = req.body || {};
    const dia = validarFechaMovimientoLote(datos.fecha);

    const observacionesEnvio =
      typeof datos.observaciones === "string"
        ? datos.observaciones.trim()
        : "";

    if (observacionesEnvio.length > 2000) {
      throw fallo(
        400,
        "Las observaciones son demasiado largas."
      );
    }

    if (
      typeof datos.claveOperacion !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(
        datos.claveOperacion
      )
    ) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const solicitud = {
      fechaEnvio: new Date(`${dia}T00:00:00.000Z`),
      observacionesEnvio,
      detalles: normalizarDetalleRetiroLote(
        datos.detalles
      )
    };

    const envioId = new mongoose.Types.ObjectId(
      createHash("sha256")
        .update(
          `envio-lote:${id.toLowerCase()}:` +
          `${req.usuarioCaja._id}:${datos.claveOperacion}`
        )
        .digest("hex")
        .slice(0, 24)
    );

    session = await mongoose.startSession();

    let guardado;
    let repetida = false;

    await session.withTransaction(async () => {
      repetida = false;

      const lote = await LoteCrianza.findOneAndUpdate(
        {
          _id: id,
          sede: "MONASTERIO",
          especie: "POLLOS"
        },
        {
          $inc: { __v: 1 }
        },
        {
          returnDocument: "after",
          session
        }
      );

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      if (dia < diaComercial(lote.fechaInicio)) {
        throw fallo(
          400,
          "El envío no puede ser anterior al inicio del lote."
        );
      }

      const anterior = await EnvioLote.findById(
        envioId
      ).session(session);

      if (anterior) {
        if (
          String(anterior.loteId) !== String(lote._id) ||
          String(anterior.enviadoPor) !==
            String(req.usuarioCaja._id) ||
          firmaEnvio(anterior) !== firmaEnvio(solicitud)
        ) {
          throw fallo(
            409,
            "El identificador ya fue utilizado con otros datos."
          );
        }

        guardado = anterior;
        repetida = true;
        return;
      }

      const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Caracas",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const parte = (tipo) =>
        partes.find((item) => item.type === tipo).value;

      const hoy =
        `${parte("year")}-${parte("month")}-${parte("day")}`;

      const alcances = [];

      for (
        let cursor = new Date(lote.fechaInicio);
        diaComercial(cursor) <= hoy;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        alcances.push({
          fecha: diaComercial(cursor),
          sede: "MONASTERIO"
        });
      }

      await tocarDias(alcances, session);

      await comprobarAbierta(
        dia,
        "MONASTERIO",
        session
      );

      const inicioMes = new Date(
        `${dia.slice(0, 7)}-01T00:00:00.000Z`
      );

      const finMes = new Date(inicioMes);
      finMes.setUTCMonth(finMes.getUTCMonth() + 1);

      const periodo = {
        sede: "MONASTERIO",
        cierre: "S",
        fecha: {
          $gte: inicioMes,
          $lt: finMes
        }
      };

      if (
        await Entrada.exists(periodo).session(session) ||
        await Salida.exists(periodo).session(session)
      ) {
        throw fallo(
          409,
          "El período tiene movimientos cerrados. No se puede registrar el envío."
        );
      }

      const disponibles = await consultarSaldoLote(
        lote._id,
        "MONASTERIO",
        dia,
        session
      );

      const detallesGuardados = [];
      const salidas = [];

      for (const detalle of solicitud.detalles) {
        const saldo = disponibles.find(
          (item) => item.productoId === detalle.productoId
        );

        if (!saldo || !saldo.habilitado) {
          throw fallo(
            409,
            saldo?.bloqueos?.join(" ") ||
            "El producto no tiene existencias disponibles del lote."
          );
        }

        const gramos = Math.round(
          detalle.pesoKg * 1000
        );

        const existentes = Math.round(
          saldo.disponibleKg * 1000
        );

        if (gramos > existentes) {
          throw fallo(
            409,
            `El peso supera lo disponible de ${saldo.descripcion}.`
          );
        }

        if (saldo.presentacion === "SOLO_PESO") {
          if (detalle.cantidadPresentaciones !== null) {
            throw fallo(
              400,
              "Este producto se envía únicamente por kilos."
            );
          }
        } else {
          const cantidad = detalle.cantidadPresentaciones;

          if (
            !Number.isSafeInteger(cantidad) ||
            cantidad <= 0 ||
            cantidad > saldo.presentacionesDisponibles
          ) {
            throw fallo(
              409,
              `Revise las piezas o paquetes de ${saldo.descripcion}.`
            );
          }

          if (
            (gramos === existentes) !==
            (cantidad === saldo.presentacionesDisponibles)
          ) {
            throw fallo(
              409,
              `Revise los kilos y las piezas o paquetes restantes de ${saldo.descripcion}.`
            );
          }
        }

        const producto = await Producto.findOne({
          _id: detalle.productoId,
          sede: "MONASTERIO"
        })
          .select("categoria")
          .session(session);

        if (!producto) {
          throw fallo(
            409,
            "El producto ya no está disponible en Monasterio."
          );
        }

        const salidaId = new mongoose.Types.ObjectId();

        detallesGuardados.push({
          productoOrigenId: detalle.productoId,
          codigoOrigen: saldo.codigo,
          descripcionOrigen: saldo.descripcion,
          presentacion: saldo.presentacion,
          pesoEnviadoKg: detalle.pesoKg,
          presentacionesEnviadas:
            detalle.cantidadPresentaciones,
          salidaId
        });

        salidas.push({
          _id: salidaId,
          fecha: solicitud.fechaEnvio,
          categoria: producto.categoria,
          productoId: detalle.productoId,
          codigo: saldo.codigo,
          cantidad: detalle.pesoKg,
          observacion: "ENVÍO A TIENDITA DEL LOTE",
          sede: "MONASTERIO",
          cierre: "N",
          loteId: lote._id,
          envioId,
          presentacionProduccion: saldo.presentacion,
          cantidadPresentaciones:
            detalle.cantidadPresentaciones
        });
      }

      const numeroEnvio = await siguienteNumero(
        solicitud.fechaEnvio,
        session
      );

      const registros = await EnvioLote.create(
        [
          {
            _id: envioId,
            numeroEnvio,
            loteId: lote._id,
            origen: "MONASTERIO",
            destino: "TIENDITA",
            fechaEnvio: solicitud.fechaEnvio,
            estado: "EN_TRANSITO",
            enviadoPor: req.usuarioCaja._id,
            observacionesEnvio,
            claveOperacion: datos.claveOperacion,
            detalles: detallesGuardados
          }
        ],
        {
          session,
          ordered: true
        }
      );

      await Salida.create(salidas, {
        session,
        ordered: true
      });

      guardado = registros[0];
    });

    return res.status(repetida ? 200 : 201).json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Este envío ya estaba registrado."
        : "Envío registrado. Queda pendiente de recepción en Tiendita.",
      envio: guardado
    });
  } catch (error) {
    console.error("Error registrando envío:", error);

    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo confirmar el envío. Conserve la solicitud para reintentar."
    });
  } finally {
    if (session) await session.endSession();
  }
}