import express from "express";
import Log from "../models/Log.js";

const router = express.Router();

// Crear log
router.post("/", async (req, res) => {
  try {
    const nuevoLog = new Log(req.body);
    await nuevoLog.save();

    res.json({ ok: true, mensaje: "Log guardado" });
  } catch (error) {
    console.error("Error guardando log:", error);
    res.status(500).json({ ok: false, error: "Error guardando log" });
  }
});

// Obtener logs
// Obtener logs con paginación
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;     // página actual
    const limit = parseInt(req.query.limit) || 20;  // registros por página
    const skip = (page - 1) * limit;

    const total = await Log.countDocuments();
    const logs = await Log.find()
      .sort({ fecha: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      logs
    });

  } catch (error) {
    console.error("Error obteniendo logs:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo logs" });
  }
});

export default router;