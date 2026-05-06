// routes/rou_salidas.js
import express from "express";
import dbSalidas from "../models/dbSalidas.js";

const router = express.Router();

// GET paginado 
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await dbSalidas.countDocuments();

    const salidas = await dbSalidas
    .find()    
    .populate("productoId", "codigo descripcion categoria")
    .sort({ fecha: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);
    console.log("SALIDA PRODUCTO:", salidas[0].productoId);
    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      salidas
    });

  } catch (error) {
    return res.status(400).json({
      ok: false,
      mensaje: "Error obteniendo salidas",
      detalle: error.message
    });
  }
});


// POST crear
router.post("/", async (req, res) => {
  try {
    const { fecha, categoria, productoId, codigo, cantidad, observacion } = req.body;
    const Unasalida = await dbSalidas.create({
      fecha: new Date(fecha),
      categoria,
      productoId,
      codigo,
      cantidad,
      observacion
    });
    res.status(201).json({ ok: true, Unasalida });
    console.log("RESPUESTA QUE SE VA A ENVIAR:", { ok: true, salida: Unasalida });
  console.log("BODY RECIBIDO:", req.body);

  } catch (error) {
    return res.status(400).json({
      ok: false,
      mensaje: "Error creando salida en POST",
      detalle: error.message
    });
  }
});

// PUT actualizar (solo fecha y cantidad)
router.put("/:id", async (req, res) => {
  try {
    const { fecha, cantidad } = req.body;

    const Unasalida = await dbSalidas.findByIdAndUpdate(
      req.params.id,
      {
        fecha: new Date(fecha),
        cantidad
      },
      { new: true }
    );

    if (!Unasalida) {
      return res.status(404).json({ ok: false, mensaje: "Salida no encontrada" });
    }

    res.json({ ok: true, Salida: Unasalida });

  } catch (error) {
    return res.status(400).json({
      ok: false,
      mensaje: "Error actualizando salida put",
      detalle: error.message
    });
  }
});

// DELETE eliminar
router.delete("/:id", async (req, res) => {
  try {
    const eliminado = await dbSalidas.findByIdAndDelete(req.params.id);

    if (!eliminado) {
      return res.status(404).json({ ok: false, mensaje: "Salida no encontrada" });
    }

    res.json({ ok: true });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: "Error eliminando salida",
      detalle: error.message
    });
  }
});

export default router;