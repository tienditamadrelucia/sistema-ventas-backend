import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Gastos from "../models/dbGastos.js";
import LoteCrianza from "../models/LoteCrianza.js";
import ActividadProductiva from "../models/dbListaProductiva.js";
import {
  comprobarAcceso,
  comprobarAbierta,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  CONCEPTOS_LOTE,
  responderErrorGastoLote
} from "./gastosLote.js";

function importe(valor, nombre) {
  const numero =
    typeof valor === "number" ||
    (
      typeof valor === "string" &&
      valor.trim() !== ""
    )
      ? Number(valor)
      : NaN;

  const centavos = Math.round(numero * 100);

  if (
    !Number.isFinite(numero) ||
    numero <= 0 ||
    !Number.isSafeInteger(centavos) ||
    centavos <= 0 ||
    Math.abs(numero * 100 - centavos) >= 0.000001
  ) {
    throw fallo(
      400,
      `${nombre} debe ser mayor que cero y tener hasta dos decimales.`
    );
  }

  return centavos / 100;
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

function firmaGasto(gasto, asignacion) {
  return JSON.stringify({
    fecha: diaComercial(gasto.fecha),
    sede: gasto.sede,
    descripcion: gasto.descripcion,
    moneda: gasto.moneda,
    monto: gasto.monto,
    cajaChica: gasto.cajaChica,
    numeroRecibo: gasto.numeroRecibo || null,
    clasificacion: gasto.clasificacion,
    actividadProductiva: String(
      gasto.actividadProductiva
    ),
    concepto: asignacion.concepto,
    montoAsignado: asignacion.montoAsignado
  });
}

export async function crearGastoLote(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;
    const datos = req.body || {};

    if (
      !/^[a-fA-F0-9]{24}$/.test(id || "") ||
      !/^[a-fA-F0-9]{24}$/.test(
        datos.actividadProductiva || ""
      )
    ) {
      throw fallo(
        400,
        "Seleccione un lote y una actividad productiva válidos."
      );
    }

    if (!["TIENDITA", "MONASTERIO"].includes(datos.sede)) {
      throw fallo(400, "Seleccione la sede que paga.");
    }

    comprobarAcceso(req, datos.sede);

    if (!["D", "P", "Bs"].includes(datos.moneda)) {
      throw fallo(400, "Seleccione una moneda válida.");
    }

    if (
      !CONCEPTOS_LOTE.some(
        (concepto) => concepto.codigo === datos.concepto
      )
    ) {
      throw fallo(400, "Seleccione un concepto válido.");
    }

    if (
      typeof datos.fecha !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)
    ) {
      throw fallo(400, "Seleccione una fecha válida.");
    }

    const dia = diaComercial(datos.fecha);

    if (dia > hoyVenezuela()) {
      throw fallo(400, "No puede registrar un gasto futuro.");
    }

    const descripcion =
      typeof datos.descripcion === "string"
        ? datos.descripcion.trim()
        : "";

    if (!descripcion || descripcion.length > 500) {
      throw fallo(
        400,
        "Indique una descripción de hasta 500 caracteres."
      );
    }

    const numeroRecibo =
      typeof datos.numeroRecibo === "string"
        ? datos.numeroRecibo.trim()
        : "";

    if (numeroRecibo.length > 100) {
      throw fallo(400, "El número de recibo es demasiado largo.");
    }

    if (typeof datos.cajaChica !== "boolean") {
      throw fallo(400, "Indique si salió de caja chica.");
    }

    const monto = importe(datos.monto, "El monto del gasto");
    const montoAsignado = importe(
      datos.montoAsignado,
      "El monto asignado al lote"
    );

    if (
      Math.round(montoAsignado * 100) >
      Math.round(monto * 100)
    ) {
      throw fallo(
        400,
        "No puede asignar al lote más que el monto del gasto."
      );
    }

    const claveOperacion =
      typeof datos.claveOperacion === "string"
        ? datos.claveOperacion.trim()
        : "";

    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(claveOperacion)) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const gastoId = new mongoose.Types.ObjectId(
      createHash("sha256")
        .update(
          `gasto-lote:${req.usuarioCaja._id}:` +
          `${id.toLowerCase()}:${claveOperacion}`
        )
        .digest("hex")
        .slice(0, 24)
    );

    const valores = {
      fecha: new Date(`${dia}T00:00:00.000Z`),
      sede: datos.sede,
      descripcion,
      moneda: datos.moneda,
      monto,
      cajaChica: datos.cajaChica,
      numeroRecibo:
        numeroRecibo && numeroRecibo !== "0"
          ? numeroRecibo
          : null,
      clasificacion: "COSTO_PRODUCCION",
      actividadProductiva:
        datos.actividadProductiva.toLowerCase()
    };

    const asignacionSolicitada = {
      concepto: datos.concepto,
      montoAsignado
    };

    session = await mongoose.startSession();

    let gastoGuardado;
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

      const anterior = await Gastos.findById(
        gastoId
      ).session(session);

      if (anterior) {
        const asignaciones = (
          anterior.asignacionesLotes || []
        ).filter(
          (asignacion) =>
            String(asignacion.loteId) === String(lote._id)
        );

        if (
          asignaciones.length !== 1 ||
          firmaGasto(anterior, asignaciones[0]) !==
            firmaGasto(valores, asignacionSolicitada)
        ) {
          throw fallo(
            409,
            "Esta solicitud ya fue utilizada con otros datos."
          );
        }

        gastoGuardado = anterior;
        repetida = true;
        return;
      }

      await tocarDias(
        [{ fecha: dia, sede: valores.sede }],
        session
      );

      await comprobarAbierta(
        dia,
        valores.sede,
        session
      );

      const inicioMes = new Date(
        `${dia.slice(0, 7)}-01T00:00:00.000Z`
      );

      const finMes = new Date(inicioMes);
      finMes.setUTCMonth(finMes.getUTCMonth() + 1);

      const filtroSede = valores.sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

      const tieneGastosCerrados = await Gastos.exists({
        ...filtroSede,
        fecha: {
          $gte: inicioMes,
          $lt: finMes
        },
        cierre: "S"
      }).session(session);

      if (tieneGastosCerrados) {
        throw fallo(
          409,
          "El mes tiene gastos cerrados en la sede que paga."
        );
      }

      const actividad = await ActividadProductiva.findOne({
        _id: valores.actividadProductiva,
        activa: { $ne: false }
      }).session(session);

      if (!actividad) {
        throw fallo(
          400,
          "La actividad productiva no existe o está inactiva."
        );
      }

      if (valores.numeroRecibo) {
        const duplicado = await Gastos.exists({
          ...filtroSede,
          numeroRecibo: valores.numeroRecibo
        }).session(session);

        if (duplicado) {
          throw fallo(
            409,
            "Ya existe un gasto con ese recibo en la sede que paga. Revíselo antes de registrar otro."
          );
        }
      }

      const registros = await Gastos.create(
        [
          {
            _id: gastoId,
            ...valores,
            usuario:
              req.usuarioCaja.nombre ||
              req.usuarioCaja.usuario ||
              String(req.usuarioCaja._id),
            cierre: "N",
            asignacionesLotes: [
              {
                loteId: lote._id,
                sedeProduccion: "MONASTERIO",
                ...asignacionSolicitada,
                asignadoPor: req.usuarioCaja._id,
                fechaAsignacion: new Date()
              }
            ]
          }
        ],
        {
          session,
          ordered: true
        }
      );

      gastoGuardado = registros[0];
    });

    return res.status(repetida ? 200 : 201).json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Este gasto ya estaba registrado."
        : "Gasto registrado y vinculado correctamente.",
      gastoId: gastoGuardado._id
    });
  } catch (error) {
    return responderErrorGastoLote(res, error);
  } finally {
    if (session) await session.endSession();
  }
}