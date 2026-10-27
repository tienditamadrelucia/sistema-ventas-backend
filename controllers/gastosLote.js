import mongoose from "mongoose";
import Gastos from "../models/dbGastos.js";
import LoteCrianza from "../models/LoteCrianza.js";
import {
  comprobarAcceso,
  fallo
} from "../utils/controlCaja.js";

export const CONCEPTOS_LOTE = [
  {
    codigo: "COMPRA_POLLITOS",
    nombre: "Compra de pollitos"
  },
  {
    codigo: "ALIMENTO",
    nombre: "Alimento"
  },
  {
    codigo: "MEDICAMENTOS_VACUNAS",
    nombre: "Medicamentos y vacunas"
  },
  {
    codigo: "CAMA_LIMPIEZA",
    nombre: "Cama y limpieza"
  },
  {
    codigo: "ATENCION_VETERINARIA",
    nombre: "Atención veterinaria"
  },
  {
    codigo: "PROCESAMIENTO",
    nombre: "Procesamiento"
  },
  {
    codigo: "EMPAQUE",
    nombre: "Empaque"
  },
  {
    codigo: "TRANSPORTE",
    nombre: "Transporte"
  },
  {
    codigo: "OTROS",
    nombre: "Otros costos del lote"
  }
];

export function centavos(valor) {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor < 0
  ) {
    throw fallo(409, "Un gasto tiene un monto no válido.");
  }

  const resultado = Math.round(valor * 100);

  if (
    !Number.isSafeInteger(resultado) ||
    Math.abs(valor * 100 - resultado) >= 0.000001
  ) {
    throw fallo(
      409,
      "Un gasto tiene un monto que requiere revisión."
    );
  }

  return resultado;
}

export function sedePagadora(gasto) {
  if (
    gasto.sede === undefined ||
    gasto.sede === "TIENDITA"
  ) {
    return "TIENDITA";
  }

  if (gasto.sede === "MONASTERIO") {
    return "MONASTERIO";
  }

  throw fallo(
    409,
    "Un gasto tiene una sede que requiere revisión."
  );
}

export function responderErrorGastoLote(res, error) {
  console.error("Error en gastos del lote:", error);

  return res.status(error.estado || 500).json({
    ok: false,
    mensaje: error.estado
      ? error.message
      : "No se pudo completar la operación de gastos del lote."
  });
}

// =====================================================
// CONSULTAR GASTOS ASIGNADOS AL LOTE
// =====================================================
export async function obtenerGastosLote(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
      throw fallo(400, "El lote indicado no es válido.");
    }

    session = await mongoose.startSession();

    let resultado;

    await session.withTransaction(async () => {
      const lote = await LoteCrianza.findOne({
        _id: id,
        sede: "MONASTERIO",
        especie: "POLLOS"
      })
        .session(session)
        .lean();

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      const gastos = await Gastos.find({
        "asignacionesLotes.loteId": lote._id
      })
        .sort({ fecha: -1, _id: -1 })
        .session(session)
        .lean();

      const totalesCentavos = {
        D: 0,
        P: 0,
        Bs: 0
      };

      const filas = gastos.map((gasto) => {
        if (
          !Object.prototype.hasOwnProperty.call(
            totalesCentavos,
            gasto.moneda
          )
        ) {
          throw fallo(
            409,
            "Un gasto asignado tiene una moneda que requiere revisión."
          );
        }

        const asignaciones = gasto.asignacionesLotes || [];

        const totalAsignado = asignaciones.reduce(
          (suma, asignacion) =>
            suma + centavos(asignacion.montoAsignado),
          0
        );

        if (
          !Number.isSafeInteger(totalAsignado) ||
          totalAsignado > centavos(gasto.monto)
        ) {
          throw fallo(
            409,
            "Un gasto tiene asignaciones superiores a su monto."
          );
        }

        const delLote = asignaciones.filter(
          (asignacion) =>
            String(asignacion.loteId) ===
            String(lote._id)
        );

        if (delLote.length !== 1) {
          throw fallo(
            409,
            "Un gasto tiene asignaciones repetidas para este lote."
          );
        }

        const asignacion = delLote[0];
        const montoCentavos = centavos(
          asignacion.montoAsignado
        );

        totalesCentavos[gasto.moneda] += montoCentavos;

        if (
          !Number.isSafeInteger(
            totalesCentavos[gasto.moneda]
          )
        ) {
          throw fallo(
            409,
            "El total supera el importe admitido."
          );
        }

        return {
          gastoId: gasto._id,
          fecha: gasto.fecha,
          sedePagadora: sedePagadora(gasto),
          sedeProduccion: "MONASTERIO",
          concepto: asignacion.concepto,
          descripcion: gasto.descripcion,
          moneda: gasto.moneda,
          montoGasto: gasto.monto,
          montoAsignado: montoCentavos / 100,
          numeroRecibo: gasto.numeroRecibo || "",
          cajaChica: gasto.cajaChica === true,
          cierre: gasto.cierre
        };
      });

      resultado = {
        lote: {
          _id: lote._id,
          nombre: lote.nombre,
          fechaInicio: lote.fechaInicio
        },
        conceptos: CONCEPTOS_LOTE,
        gastos: filas,
        totales: {
          D: totalesCentavos.D / 100,
          P: totalesCentavos.P / 100,
          Bs: totalesCentavos.Bs / 100
        }
      };
    });

    return res.json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    return responderErrorGastoLote(res, error);
  } finally {
    if (session) await session.endSession();
  }
}