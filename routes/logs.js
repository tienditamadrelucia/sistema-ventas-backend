import express from "express";
import Log from "../models/Log.js";

const router = express.Router();

const SEDES = ["TIENDITA", "MONASTERIO"];

// REGISTRAR ACCIÓN
router.post("/", async (req, res) => {
  try {
    const {
      usuario,
      accion,
      sede
    } = req.body || {};

    if (
      typeof usuario !== "string" ||
      !usuario.trim() ||
      typeof accion !== "string" ||
      !accion.trim()
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Usuario y acción son obligatorios."
      });
    }

    if (sede !== undefined && !SEDES.includes(sede)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida."
      });
    }

    const datos = {
      usuario: usuario.trim(),
      accion: accion.trim(),
      fecha: new Date()
    };

    if (sede !== undefined) {
      datos.sede = sede;
    }

    await Log.create(datos);

    return res.json({
      ok: true,
      mensaje: "Acción registrada."
    });
  } catch (error) {
    console.error("Error guardando acción:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo registrar la acción."
    });
  }
});

// CONSULTAR BITÁCORA CON PAGINACIÓN
router.get("/", async (req, res) => {
  try {
    const sede = req.query.sede || "TODAS";

    if (
      ![...SEDES, "TODAS", "SIN_SEDE"].includes(sede)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Filtro de sede inválido."
      });
    }

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    let filtro = {};

    if (SEDES.includes(sede)) {
      filtro = { sede };
    } else if (sede === "SIN_SEDE") {
      filtro = {
        $or: [
          { sede: { $exists: false } },
          { sede: null },
          { sede: "" }
        ]
      };
    }

    const total = await Log.countDocuments(filtro);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pagina = Math.min(page, totalPages);

    const logs = await Log.find(filtro)
      .sort({ fecha: -1, _id: -1 })
      .skip((pagina - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      total,
      page: pagina,
      totalPages,
      logs
    });
  } catch (error) {
    console.error("Error consultando bitácora:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo consultar la bitácora."
    });
  }
});

export default router;