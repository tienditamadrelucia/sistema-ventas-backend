import express from "express";
import Entrada from "../models/Entrada.js";
import Producto from "../models/Producto.js";

const router = express.Router();

// -------------------------------------------------------------
// GET paginado (incluye costo y venta del producto)
// -------------------------------------------------------------
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
      .populate("productoId", "codigo descripcion categoria costo venta");

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

// -------------------------------------------------------------
// POST - Crear entrada
// -------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { fecha, categoria, productoId, codigo, cantidad, observacion, precioCompra, precioVenta } = req.body;

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    }

    let precioCompraFinal = precioCompra;
    let precioVentaFinal = precioVenta;

    // ⭐ COMPRAS
    if (observacion === "COMPRAS") {
      if (!precioCompra || precioCompra <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de compra." });
      }
      if (!precioVenta || precioVenta <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de venta." });
      }
      if (precioVenta < precioCompra * 1.30) {
        return res.status(400).json({ ok: false, error: "El precio de venta debe ser al menos 30% mayor que el precio de compra." });
      }
    }

    // ⭐ PRODUCCIÓN DEL MONASTERIO
    else if (observacion === "PRODUCCIÓN DEL MONASTERIO") {
      if (!precioVenta || precioVenta <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de venta." });
      }

      precioCompraFinal = precioVenta * 0.50;

      if (precioVenta < precioCompraFinal * 1.30) {
        return res.status(400).json({ ok: false, error: "El precio de venta no cumple el margen mínimo del 30%." });
      }
    }

    // ⭐ Otros motivos → no se usan precios
    else {
      precioCompraFinal = null;
      precioVentaFinal = null;
    }

    // ⭐ ACTUALIZAR PRODUCTO SI APLICA
    if (observacion === "COMPRAS" || observacion === "PRODUCCIÓN DEL MONASTERIO") {
      producto.costo = precioCompraFinal;
      producto.venta = precioVentaFinal;
      await producto.save();
    }

    // ⭐ Crear entrada
    const entrada = await Entrada.create({
      fecha: new Date(fecha),
      categoria,
      productoId,
      codigo,
      cantidad,
      observacion,
      precioCompra: precioCompraFinal,
      precioVenta: precioVentaFinal
    });

    res.json({ ok: true, entrada });

  } catch (error) {
    return res.status(400).json({
      ok: false,
      mensaje: "Error creando entrada",
      detalle: error.message
    });
  }
});

// -------------------------------------------------------------
// PUT - Actualizar entrada
// -------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const { fecha, categoria, productoId, codigo, cantidad, observacion, precioCompra, precioVenta } = req.body;

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    }

    let precioCompraFinal = precioCompra;
    let precioVentaFinal = precioVenta;

    // ⭐ COMPRAS
    if (observacion === "COMPRAS") {
      if (!precioCompra || precioCompra <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de compra." });
      }
      if (!precioVenta || precioVenta <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de venta." });
      }
      if (precioVenta < precioCompra * 1.30) {
        return res.status(400).json({ ok: false, error: "El precio de venta debe ser al menos 30% mayor que el precio de compra." });
      }
    }

    // ⭐ PRODUCCIÓN DEL MONASTERIO
    else if (observacion === "PRODUCCIÓN DEL MONASTERIO") {
      if (!precioVenta || precioVenta <= 0) {
        return res.status(400).json({ ok: false, error: "Debe ingresar el precio de venta." });
      }

      precioCompraFinal = precioVenta * 0.50;

      if (precioVenta < precioCompraFinal * 1.30) {
        return res.status(400).json({ ok: false, error: "El precio de venta no cumple el margen mínimo del 30%." });
      }
    }

    // ⭐ Otros motivos
    else {
      precioCompraFinal = null;
      precioVentaFinal = null;
    }

    // ⭐ ACTUALIZAR PRODUCTO SI APLICA
    if (observacion === "COMPRAS" || observacion === "PRODUCCIÓN DEL MONASTERIO") {
      producto.costo = precioCompraFinal;
      producto.venta = precioVentaFinal;
      await producto.save();
    }

    // ⭐ Actualizar entrada
    const entrada = await Entrada.findByIdAndUpdate(
      req.params.id,
      {
        fecha: new Date(fecha),
        categoria,
        productoId,
        codigo,
        cantidad,
        observacion,
        precioCompra: precioCompraFinal,
        precioVenta: precioVentaFinal
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
      mensaje: "Error actualizando entrada",
      detalle: error.message
    });
  }
});

// -------------------------------------------------------------
// DELETE - Eliminar entrada
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// REPORTE
// -------------------------------------------------------------
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
      .populate("productoId", "codigo descripcion categoria costo venta")
      .sort({ fecha: 1 });

    res.json(entradas);

  } catch (error) {
    console.error("Error en reporte de entradas:", error);
    res.status(500).json({ error: "Error generando reporte" });
  }
});

export default router;
