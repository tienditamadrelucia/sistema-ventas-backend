import express from "express";
import LoteCrianza from "../models/LoteCrianza.js";
import {
  autenticar,
  comprobarAcceso,
  responderFallo
} from "../utils/controlCaja.js";

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

export default router;