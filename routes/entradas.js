import express from "express";
import Entrada from "../models/Entrada.js";

const router = express.Router();

// GET paginado (con filtro por fecha opcional)
// 🟢 LISTAR ENTRADAS CON PAGINACIÓN Y FECHA OPCIONAL
// 🟢 LISTAR ENTRADAS SIN FILTRO, SOLO PAGINACIÓN
// 🟢 LISTAR ENTRADAS CON PAGINACIÓN (SIN FILTRO)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Entrada.countDocuments();
    const entradas = await Entrada.find()
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productoId", "codigo descripcion categoria");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      entradas
    });
  } catch (error) {
    console.error("Error listando entradas:", error);
    res.status(500).json({ ok: false, error: "Error listando entradas" });
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

router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    const filtro = {};

    if (desde && hasta) {
      filtro.fecha = {
        $gte: new Date(desde),
        $lte: new Date(hasta)
      };
    }

    const entradas = await Entrada.find(filtro)
      .populate("productoId", "codigo descripcion categoria")
      .sort({ fecha: 1 });

    res.json(entradas);

  } catch (error) {
    console.error("Error en reporte de entradas:", error);
    res.status(500).json({ error: "Error generando reporte" });
  }
});

export default router;