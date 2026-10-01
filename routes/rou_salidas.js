// routes/rou_salidas.js
import express from "express";
import dbSalidas from "../models/dbSalidas.js";
import Producto from "../models/Producto.js";

const router = express.Router();
const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  // Las salidas antiguas no tienen sede.
  // Esas pertenecen a la TIENDITA.
  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};

// GET paginado
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const sede = req.query.sede || "TIENDITA";
    const filtro = filtroPorSede(sede);

    const total = await dbSalidas.countDocuments(filtro);

    const salidas = await dbSalidas
      .find(filtro)
      .populate("productoId", "codigo descripcion categoria sede")
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

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

// GET REPORTE POR FECHAS
router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe enviar fecha desde y hasta"
      });
    }
    const inicio = new Date(desde);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);
    const salidas = await dbSalidas
      .find({
        fecha: { $gte: inicio, $lte: fin }
      })
      .populate("productoId", "codigo descripcion categoria")
      .sort({ fecha: 1 });
    res.json(salidas);
  } catch (error) {
    console.error("Error en reporte de salidas:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error generando reporte de salidas",
      detalle: error.message
    });
  }
});


// POST crear
router.post("/", async (req, res) => {
  try {
    const {
      fecha,
      categoria,
      productoId,
      codigo,
      cantidad,
      observacion,
      sede
    } = req.body;

    const sedeFinal =
      sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    // Verificar que el producto exista
    const producto = await Producto.findById(productoId);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado."
      });
    }

    // Los productos antiguos sin sede pertenecen a TIENDITA
    const sedeProducto =
      producto.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    if (sedeProducto !== sedeFinal) {
      return res.status(400).json({
        ok: false,
        error: "El producto no pertenece a la sede seleccionada."
      });
    }

    const Unasalida = await dbSalidas.create({
      fecha: new Date(fecha),
      categoria,
      productoId,
      codigo,
      cantidad,
      observacion,
      sede: sedeFinal
    });

    res.status(201).json({
      ok: true,
      Unasalida
    });

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
    const { fecha, cantidad, sede } = req.body;

    const sedeFinal =
      sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    // Buscar primero la salida
    const salidaExistente = await dbSalidas.findById(req.params.id);

    if (!salidaExistente) {
      return res.status(404).json({
        ok: false,
        mensaje: "Salida no encontrada"
      });
    }

    // Las salidas antiguas sin sede pertenecen a TIENDITA
    const sedeSalida =
      salidaExistente.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    if (sedeSalida !== sedeFinal) {
      return res.status(400).json({
        ok: false,
        error: "La salida no pertenece a la sede seleccionada."
      });
    }

    const Unasalida = await dbSalidas.findByIdAndUpdate(
      req.params.id,
      {
        fecha: new Date(fecha),
        cantidad,
        sede: sedeFinal
      },
      { new: true }
    );

    res.json({
      ok: true,
      Salida: Unasalida
    });

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