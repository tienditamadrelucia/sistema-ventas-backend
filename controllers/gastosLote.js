import mongoose from "mongoose";
import Gastos from "../models/dbGastos.js";
import LoteCrianza from "../models/LoteCrianza.js";
import {
  comprobarAcceso,
  diaComercial,
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

// =====================================================
// BUSCAR GASTOS EXISTENTES PARA VINCULAR
// =====================================================
export async function buscarGastosAsignables(req, res) {
  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;
    const { sede, desde, hasta } = req.query;

    if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
      throw fallo(400, "El lote indicado no es válido.");
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      throw fallo(400, "Seleccione la sede que pagó.");
    }

    comprobarAcceso(req, sede);

    if (
      typeof desde !== "string" ||
      typeof hasta !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(desde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(hasta)
    ) {
      throw fallo(400, "Seleccione las fechas de búsqueda.");
    }

    const inicioDia = diaComercial(desde);
    const finDia = diaComercial(hasta);

    const inicio = new Date(
      `${inicioDia}T00:00:00.000Z`
    );

    const fin = new Date(
      `${finDia}T00:00:00.000Z`
    );

    const dias = Math.round(
      (fin.getTime() - inicio.getTime()) / 86400000
    ) + 1;

    if (dias < 1 || dias > 366) {
      throw fallo(
        400,
        "Seleccione un período de hasta 366 días."
      );
    }

    fin.setUTCDate(fin.getUTCDate() + 1);

    const pagina = Number(req.query.pagina || 1);

    if (
      !Number.isSafeInteger(pagina) ||
      pagina < 1 ||
      pagina > 10000
    ) {
      throw fallo(400, "La página indicada no es válida.");
    }

    const lote = await LoteCrianza.findOne({
      _id: id,
      sede: "MONASTERIO",
      especie: "POLLOS"
    })
      .select("_id")
      .lean();

    if (!lote) {
      throw fallo(404, "El lote no existe.");
    }

    const filtroSede = sede === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    const limite = 50;

    const encontrados = await Gastos.find({
      ...filtroSede,
      fecha: {
        $gte: inicio,
        $lt: fin
      },
      cierre: { $ne: "S" },
      clasificacion: { $ne: "COMPRA_REVENTA" },
      compraReventa: null,
      moneda: { $in: ["D", "P", "Bs"] },
      "asignacionesLotes.loteId": {
        $ne: lote._id
      }
    })
      .select(
        "fecha sede descripcion moneda monto " +
        "numeroRecibo cajaChica asignacionesLotes"
      )
      .sort({ fecha: -1, _id: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite + 1)
      .lean();

    const hayMas = encontrados.length > limite;
    const gastos = [];

    for (const gasto of encontrados.slice(0, limite)) {
      const montoCentavos = centavos(gasto.monto);

      const asignadoCentavos = (
        gasto.asignacionesLotes || []
      ).reduce(
        (suma, asignacion) =>
          suma + centavos(asignacion.montoAsignado),
        0
      );

      if (
        !Number.isSafeInteger(asignadoCentavos) ||
        asignadoCentavos > montoCentavos
      ) {
        throw fallo(
          409,
          "Un gasto tiene asignaciones que requieren revisión."
        );
      }

      const disponibleCentavos =
        montoCentavos - asignadoCentavos;

      if (disponibleCentavos <= 0) continue;

      gastos.push({
        gastoId: gasto._id,
        fecha: gasto.fecha,
        sedePagadora: sedePagadora(gasto),
        descripcion: gasto.descripcion,
        moneda: gasto.moneda,
        monto: gasto.monto,
        disponible: disponibleCentavos / 100,
        numeroRecibo: gasto.numeroRecibo || "",
        cajaChica: gasto.cajaChica === true
      });
    }

    return res.json({
      ok: true,
      gastos,
      pagina,
      hayMas
    });
  } catch (error) {
    return responderErrorGastoLote(res, error);
  }
}