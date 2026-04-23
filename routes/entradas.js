import express from "express";
import Entrada from "../models/Entrada.js";

const router = express.Router();

// GET paginado (con filtro por fecha opcional)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, fecha } = req.query;

    const filtro = {};
    if (fecha) {
      // fecha viene como "YYYY-MM-DD"
      const inicio = new Date(fecha);
      const fin = new Date(fecha);
      fin.setHours(23, 59, 59, 999);
      filtro.fecha = { $gte: inicio, $lte: fin };
    }

    const total = await Entrada.countDocuments(filtro);
    const entradas = await Entrada.find(filtro)
      .sort({ fecha: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("productoId", "codigo descripcion");

    res.json({
      entradas,
      paginaActual: Number(page),
      totalPaginas: Math.ceil(total / limit),
      totalRegistros: total
    });
  } catch (error) {
    return res.status(400).json({
    ok: false,
    mensaje: "Descripción clara del error",
    detalle: error.message
});
   
  }
});

router.post("/", async (req, res) => {
  try {
    const { fecha, categoria, productoId, codigo, cantidad, observacion, usuarioActual } = req.body;

    const entrada = await Entrada.create({
      fecha: new Date(fecha),
      categoria,
      productoId,
      codigo,
      cantidad,
      observacion
    });

    res.json({ ok: true, entrada });

  } catch (error) {
    return res.status(400).json({
    ok: false,
    mensaje: "Descripción clara del error",
    detalle: error.message
    });    
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { fecha, categoria, productoId, codigo, cantidad, observacion, usuarioActual } = req.body;

    const entrada = await Entrada.findByIdAndUpdate(
      req.params.id,
      {
        fecha: new Date(fecha),
        categoria,
        productoId,
        codigo,
        cantidad,
        observacion
      },
      { new: true }
    );

    if (!entrada) {
      return res.status(404).json({ ok: false, error: "Entrada no encontrada" });
    }
    
    res.json({ ok: true, entrada });

  } catch (error) {
    return res.status(400).json({
      ok: false,
      mensaje: "Descripción clara del error",
      detalle: error.message
});    
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const eliminado = await Entrada.findByIdAndDelete(req.params.id);

    if (!eliminado) {
      return res.status(404).json({ ok: false, error: "Entrada no encontrada" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;