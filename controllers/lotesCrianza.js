import mongoose from "mongoose";
import LoteCrianza from "../models/LoteCrianza.js";
import BajaCrianza from "../models/BajaCrianza.js";
import ProduccionPollo from "../models/ProduccionPollo.js";

function fallo(estado, mensaje) {
  const error = new Error(mensaje);
  error.estado = estado;
  return error;
}

function validarId(id) {
  if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
    throw fallo(400, "El identificador del lote no es válido.");
  }
}

function hoyVenezuela() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const obtener = (tipo) =>
    partes.find((parte) => parte.type === tipo).value;

  return (
    `${obtener("year")}-` +
    `${obtener("month")}-` +
    obtener("day")
  );
}

function validarFecha(texto) {
  if (
    typeof texto !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(texto)
  ) {
    throw fallo(400, "Seleccione una fecha válida.");
  }

  const fecha = new Date(`${texto}T00:00:00.000Z`);

  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== texto
  ) {
    throw fallo(400, "La fecha indicada no existe.");
  }

  if (texto > hoyVenezuela()) {
    throw fallo(400, "No puede registrar una fecha futura.");
  }

  return fecha;
}

function responderError(res, error) {
  console.error("Error en lote de crianza:", error);

  return res.status(error.estado || 500).json({
    ok: false,
    mensaje: error.estado
      ? error.message
      : "No se pudo completar la operación del lote."
  });
}

// =====================================================
// CONSULTAR UN LOTE Y SUS BAJAS
// =====================================================
export async function obtenerDetalleLote(req, res) {
  let session;

  try {
    validarId(req.params.id);

    session = await mongoose.startSession();

    let resultado;

    await session.withTransaction(async () => {
      const lote = await LoteCrianza.findOne({
        _id: req.params.id,
        sede: "MONASTERIO",
        especie: "POLLOS"
      })
        .session(session)
        .lean();

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      const bajas = await BajaCrianza.find({
        loteId: lote._id
      })
        .sort({ fecha: -1, _id: -1 })
        .session(session)
        .lean();

      const totalBajas = bajas.reduce(
        (suma, baja) => suma + baja.cantidad,
        0
      );

      const producciones = await ProduccionPollo.find({
  loteId: lote._id
})
  .sort({ fecha: -1, _id: -1 })
  .session(session)
  .lean();

const totalProcesados = producciones.reduce(
  (suma, produccion) =>
    suma + produccion.pollosProcesados,
  0
);

resultado = {
  lote,
  bajas,
  producciones,
  resumen: {
    iniciales: lote.cantidadInicial,
    bajas: totalBajas,
    procesados: totalProcesados,
    enCrianza:
      lote.cantidadInicial -
      totalBajas -
      totalProcesados
  }
};
    });

    return res.json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    return responderError(res, error);
  } finally {
    if (session) await session.endSession();
  }
}

// =====================================================
// REGISTRAR BAJA
// =====================================================
export async function registrarBajaLote(req, res) {
  let session;

  try {
    validarId(req.params.id);

    const datos = req.body || {};

    const cantidad =
      typeof datos.cantidad === "number" ||
      typeof datos.cantidad === "string"
        ? Number(datos.cantidad)
        : NaN;

    const motivo =
      typeof datos.motivo === "string"
        ? datos.motivo.trim()
        : "";

    const claveOperacion =
      typeof datos.claveOperacion === "string"
        ? datos.claveOperacion.trim()
        : "";

    if (
      !Number.isSafeInteger(cantidad) ||
      cantidad <= 0
    ) {
      throw fallo(
        400,
        "La cantidad debe ser un entero mayor que cero."
      );
    }

    if (!motivo || motivo.length > 500) {
      throw fallo(
        400,
        "Indique el motivo de la baja, de hasta 500 caracteres."
      );
    }

    if (
      !/^[a-zA-Z0-9_-]{16,100}$/.test(claveOperacion)
    ) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const fecha = validarFecha(datos.fecha);

    session = await mongoose.startSession();

    let bajaGuardada;
    let repetida = false;

    await session.withTransaction(async () => {
      repetida = false;

      // Coordina las operaciones sobre el mismo lote.
      // También evita que se elimine mientras se registra.
      const lote = await LoteCrianza.findOneAndUpdate(
        {
          _id: req.params.id,
          sede: "MONASTERIO",
          especie: "POLLOS"
        },
        {
          $inc: { __v: 1 }
        },
        {
          new: true,
          session
        }
      );

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      if (
        fecha.toISOString().slice(0, 10) <
        lote.fechaInicio.toISOString().slice(0, 10)
      ) {
        throw fallo(
          400,
          "La baja no puede ser anterior al inicio del lote."
        );
      }

      const anterior = await BajaCrianza.findOne({
        loteId: lote._id,
        claveOperacion
      }).session(session);

      if (anterior) {
        const coincide =
          anterior.cantidad === cantidad &&
          anterior.motivo === motivo &&
          anterior.fecha.getTime() === fecha.getTime() &&
          String(anterior.registradoPor) ===
            String(req.usuarioCaja._id);

        if (!coincide) {
          throw fallo(
            409,
            "El identificador ya fue utilizado con otros datos."
          );
        }

        bajaGuardada = anterior;
        repetida = true;
        return;
      }

      const bajas = await BajaCrianza.find({
        loteId: lote._id
      })
        .select("cantidad")
        .session(session)
        .lean();

      const totalBajas = bajas.reduce(
        (suma, baja) => suma + baja.cantidad,
        0
      );

      const producciones = await ProduccionPollo.find({
  loteId: lote._id
})
  .select("pollosProcesados")
  .session(session)
  .lean();

const totalProcesados = producciones.reduce(
  (suma, produccion) =>
    suma + produccion.pollosProcesados,
  0
);

const disponibles =
  lote.cantidadInicial -
  totalBajas -
  totalProcesados;

      if (cantidad > disponibles) {
        throw fallo(
          409,
          `Sólo quedan ${disponibles} animales disponibles en crianza.`
        );
      }

      const registros = await BajaCrianza.create(
        [
          {
            loteId: lote._id,
            sede: "MONASTERIO",
            fecha,
            cantidad,
            motivo,
            registradoPor: req.usuarioCaja._id,
            claveOperacion
          }
        ],
        {
          session
        }
      );

      bajaGuardada = registros[0];
    });

    return res.status(repetida ? 200 : 201).json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Esta baja ya estaba registrada."
        : "Baja registrada correctamente.",
      baja: bajaGuardada
    });
  } catch (error) {
    return responderError(res, error);
  } finally {
    if (session) await session.endSession();
  }
}