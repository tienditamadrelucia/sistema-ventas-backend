import mongoose from "mongoose";
import Gastos from "../models/dbGastos.js";
import LoteCrianza from "../models/LoteCrianza.js";
import {
  comprobarAcceso,
  comprobarAbierta,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  CONCEPTOS_LOTE,
  centavos,
  sedePagadora,
  responderErrorGastoLote
} from "./gastosLote.js";

// =====================================================
// ASIGNAR UN GASTO EXISTENTE A UN LOTE
// =====================================================
export async function asignarGastoLote(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;
    const datos = req.body || {};

    if (
      !/^[a-fA-F0-9]{24}$/.test(id || "") ||
      !/^[a-fA-F0-9]{24}$/.test(datos.gastoId || "")
    ) {
      throw fallo(
        400,
        "Seleccione un lote y un gasto válidos."
      );
    }

    if (
      !CONCEPTOS_LOTE.some(
        (concepto) =>
          concepto.codigo === datos.concepto
      )
    ) {
      throw fallo(400, "Seleccione un concepto válido.");
    }

    const montoAsignado =
      typeof datos.montoAsignado === "number" ||
      (
        typeof datos.montoAsignado === "string" &&
        datos.montoAsignado.trim() !== ""
      )
        ? Number(datos.montoAsignado)
        : NaN;

    if (
      !Number.isFinite(montoAsignado) ||
      montoAsignado <= 0
    ) {
      throw fallo(
        400,
        "Indique un importe mayor que cero."
      );
    }

    const nuevosCentavos = Math.round(
      montoAsignado * 100
    );

    if (
      !Number.isSafeInteger(nuevosCentavos) ||
      nuevosCentavos <= 0 ||
      Math.abs(
        montoAsignado * 100 - nuevosCentavos
      ) >= 0.000001
    ) {
      throw fallo(
        400,
        "El importe debe tener como máximo dos decimales."
      );
    }

    session = await mongoose.startSession();

    let resultado;

    await session.withTransaction(async () => {
      // Coordina la asignación con la eliminación del lote.
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

      // Coordina asignaciones simultáneas al mismo gasto.
      const gasto = await Gastos.findOneAndUpdate(
        {
          _id: datos.gastoId
        },
        {
          $inc: { __v: 1 }
        },
        {
          returnDocument: "after",
          session
        }
      );

      if (!gasto) {
        throw fallo(404, "El gasto no existe.");
      }

      const sede = sedePagadora(gasto);

      comprobarAcceso(req, sede);

      if (
        gasto.compraReventa ||
        gasto.clasificacion === "COMPRA_REVENTA"
      ) {
        throw fallo(
          409,
          "Las compras para reventa no pueden asignarse como gastos de crianza."
        );
      }

      if (!["D", "P", "Bs"].includes(gasto.moneda)) {
        throw fallo(
          409,
          "La moneda del gasto requiere revisión."
        );
      }

      const asignaciones = gasto.asignacionesLotes || [];

      const anterioresDelLote = asignaciones.filter(
        (asignacion) =>
          String(asignacion.loteId) === String(lote._id)
      );

      if (anterioresDelLote.length > 1) {
        throw fallo(
          409,
          "El gasto tiene asignaciones repetidas que requieren revisión."
        );
      }

      const anterior = anterioresDelLote[0];

      const totalAsignado = asignaciones.reduce(
        (suma, asignacion) =>
          suma + centavos(asignacion.montoAsignado),
        0
      );

      const montoGasto = centavos(gasto.monto);

      if (
        !Number.isSafeInteger(totalAsignado) ||
        totalAsignado > montoGasto
      ) {
        throw fallo(
          409,
          "Las asignaciones actuales del gasto requieren revisión."
        );
      }

      if (anterior) {
        if (
          centavos(anterior.montoAsignado) !==
            nuevosCentavos ||
          anterior.concepto !== datos.concepto
        ) {
          throw fallo(
            409,
            "Este gasto ya está vinculado al lote con otro importe o concepto."
          );
        }

        resultado = {
          repetida: true,
          gastoId: gasto._id,
          loteId: lote._id,
          moneda: gasto.moneda,
          sedePagadora: sede,
          montoAsignado: nuevosCentavos / 100
        };

        return;
      }

      if (gasto.cierre === "S") {
        throw fallo(
          409,
          "El gasto pertenece a un período cerrado."
        );
      }

      const dia = diaComercial(gasto.fecha);

      await tocarDias(
        [{ fecha: dia, sede }],
        session
      );

      await comprobarAbierta(
        dia,
        sede,
        session
      );

      const disponible = montoGasto - totalAsignado;

      if (nuevosCentavos > disponible) {
        throw fallo(
          409,
          `Sólo quedan ${(disponible / 100).toFixed(2)} ${gasto.moneda} disponibles para asignar.`
        );
      }

      if (!gasto.asignacionesLotes) {
        gasto.asignacionesLotes = [];
      }

      gasto.asignacionesLotes.push({
        loteId: lote._id,
        sedeProduccion: "MONASTERIO",
        concepto: datos.concepto,
        montoAsignado: nuevosCentavos / 100,
        asignadoPor: req.usuarioCaja._id,
        fechaAsignacion: new Date()
      });

      await gasto.save({ session });

      resultado = {
        repetida: false,
        gastoId: gasto._id,
        loteId: lote._id,
        moneda: gasto.moneda,
        sedePagadora: sede,
        montoAsignado: nuevosCentavos / 100
      };
    });

    return res.json({
      ok: true,
      mensaje: resultado.repetida
        ? "El gasto ya estaba vinculado con esos datos."
        : "Gasto vinculado correctamente.",
      ...resultado
    });
  } catch (error) {
    return responderErrorGastoLote(res, error);
  } finally {
    if (session) await session.endSession();
  }
}