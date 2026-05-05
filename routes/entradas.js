import express from "express";
import Entrada from "../models/Entrada.js";

const router = express.Router();

// GET paginado (con filtro por fecha opcional)
router.get("/", async (req, res) => {
  try {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;


    const filtro = {};
    if (fecha) {
      // fecha viene como "YYYY-MM-DD"
      if (fecha) {
        const inicio = new Date(`${fecha}T00:00:00.000Z`);
        const fin = new Date(`${fecha}T23:59:59.999Z`);
        filtro.fecha = { $gte: inicio, $lte: fin };
      }

    }

    const total = await Entrada.countDocuments(filtro);
    const entradas = await Entrada.find(filtro)
      .sort({ fecha: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("productoId", "codigo descripcion categoria");
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
    const { fecha, categoria, productoId, codigo, cantidad, observacion } = req.body;
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
    const { fecha, categoria, productoId, codigo, cantidad, observacion } = req.body;
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