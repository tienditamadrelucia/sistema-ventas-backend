import express from "express";
import LoteCrianza from "../models/LoteCrianza.js";
import {
  autenticar,
  comprobarAcceso,
  responderFallo
} from "../utils/controlCaja.js";
import mongoose from "mongoose";
import BajaCrianza from "../models/BajaCrianza.js";
import {
  obtenerDetalleLote,
  registrarBajaLote
} from "../controllers/lotesCrianza.js";
import ProduccionPollo from "../models/ProduccionPollo.js";
import {
  registrarProduccionPollo
} from "../controllers/produccionPollo.js";
import Gastos from "../models/dbGastos.js";

const router = express.Router();

// Se necesita una sesión activa.
router.use(autenticar);

// Se necesita acceso a la sede Monasterio.
router.use((req, res, next) => {
  try {
    comprobarAcceso(req, "MONASTERIO");
    next();
  } catch (error) {
    return responderFallo(res, error);
  }
});

// =====================================================
// CONSULTAR LOTES
// =====================================================
router.get("/", async (req, res) => {
  try {
    const lotes = await LoteCrianza.find({
      sede: "MONASTERIO",
      especie: "POLLOS"
    })
      .sort({ fechaInicio: -1, _id: -1 })
      .lean();

    return res.json({
      ok: true,
      lotes
    });
  } catch (error) {
    console.error("Error consultando lotes:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudieron consultar los lotes."
    });
  }
});

// =====================================================
// CREAR LOTE
// =====================================================
router.post("/", async (req, res) => {
  try {
    const datos = req.body || {};

    const nombre =
      typeof datos.nombre === "string"
        ? datos.nombre.trim()
        : "";

    const proveedor =
      typeof datos.proveedor === "string"
        ? datos.proveedor.trim()
        : "";

    const observaciones =
      typeof datos.observaciones === "string"
        ? datos.observaciones.trim()
        : "";

    const cantidadInicial =
      typeof datos.cantidadInicial === "number" ||
      typeof datos.cantidadInicial === "string"
        ? Number(datos.cantidadInicial)
        : NaN;

    if (!nombre || nombre.length > 120) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Indique un nombre de lote de hasta 120 caracteres."
      });
    }

    if (
      !Number.isSafeInteger(cantidadInicial) ||
      cantidadInicial <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "La cantidad de pollitos debe ser un entero mayor que cero."
      });
    }

    if (
      proveedor.length > 200 ||
      observaciones.length > 2000
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El proveedor o las observaciones superan la longitud permitida."
      });
    }

    const fechaTexto = datos.fechaInicio;

    if (
      typeof fechaTexto !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Seleccione una fecha de inicio válida."
      });
    }

    const fechaInicio = new Date(
      `${fechaTexto}T00:00:00.000Z`
    );

    if (
      !Number.isFinite(fechaInicio.getTime()) ||
      fechaInicio.toISOString().slice(0, 10) !== fechaTexto
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "La fecha de inicio no existe."
      });
    }

    const partesHoy = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/Caracas",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const parte = (tipo) =>
      partesHoy.find((p) => p.type === tipo)?.value;

    const hoy =
      `${parte("year")}-${parte("month")}-${parte("day")}`;

    if (fechaTexto > hoy) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "La fecha de inicio no puede ser posterior a hoy."
      });
    }

    const lote = await LoteCrianza.create({
      nombre,
      fechaInicio,
      cantidadInicial,
      proveedor,
      observaciones,
      sede: "MONASTERIO",
      especie: "POLLOS",
      creadoPor: req.usuarioCaja._id
    });

    return res.status(201).json({
      ok: true,
      mensaje: "Lote registrado correctamente.",
      lote
    });
  } catch (error) {
    console.error("Error registrando lote:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo registrar el lote."
    });
  }
});

// =====================================================
// ELIMINAR LOTE SIN REGISTROS ASOCIADOS
// SOLO ADMINISTRADOR
// =====================================================
router.delete("/:id", async (req, res) => {
  if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
    return res.status(403).json({
      ok: false,
      mensaje:
        "Sólo el administrador puede eliminar lotes."
    });
  }

  const { id } = req.params;

  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "El identificador del lote no es válido."
    });
  }

  let session;

  try {
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      // La eliminación se revierte si se encuentra
      // algún registro asociado.
      const lote = await LoteCrianza.findOneAndDelete(
        {
          _id: id,
          sede: "MONASTERIO",
          especie: "POLLOS"
        },
        {
          session
        }
      );

      if (!lote) {
        const error = new Error(
          "El lote no existe o ya fue eliminado."
        );
        error.estado = 404;
        throw error;
      }

      const tieneGastos = await Gastos.exists({
        "asignacionesLotes.loteId": lote._id
        }).session(session);

        if (tieneGastos) {
          const error = new Error(
          "No se puede eliminar el lote porque tiene gastos asignados."
        );

        error.estado = 409;
        throw error;
      }

        const tieneBajas = await BajaCrianza.exists({
            loteId: lote._id
          }).session(session);

          const tieneProduccion =
      await ProduccionPollo.exists({
        loteId: lote._id
      }).session(session);

    if (tieneProduccion) {
      const error = new Error(
        "No se puede eliminar el lote porque tiene producción registrada."
      );

      error.estado = 409;
      throw error;
    }

      if (tieneBajas) {
        const error = new Error(
          "No se puede eliminar el lote porque tiene bajas registradas."
        );
        error.estado = 409;
        throw error;
      }
    });

    return res.json({
      ok: true,
      mensaje: "Lote eliminado correctamente."
    });
  } catch (error) {
    console.error("Error eliminando lote:", error);

    return res.status(error.estado || 500).json({
      ok: false,
      mensaje:
        error.estado
          ? error.message
          : "No se pudo eliminar el lote."
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

// Consultar el detalle y las bajas de un lote.
router.get("/:id", obtenerDetalleLote);

// Registrar una baja de animales.
router.post("/:id/bajas", registrarBajaLote);

router.post(
  "/:id/producciones",
  registrarProduccionPollo
);

export default router;