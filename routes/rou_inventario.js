import express from "express";
import Inventario from "../models/dbInventario.js";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import mongoose from "mongoose";


// Si ya tienes ventas, importa:
//import Venta from "../models/ventas.js";
// Si NO existe ventas aún, comenta esta línea
console.log(">>> RUTA INVENTARIO NUEVA CARGADA <<<");

const router = express.Router();

/*
  GET /api/inventario?fecha=YYYY-MM-DD&categoria=ALB
  Devuelve productos + tomas existentes + stock final del sistema
*/
router.get("/", async (req, res) => {
  try {
    const { categoria } = req.query;
    const productos = await Producto.find({ categoria });
    const productosReales = [];
    for (const p of productos) {
      const productoId = p._id;
      const entradas = await Entrada.aggregate([
        { $match: { productoId } },
        { $group: { _id: null, total: { $sum: "$cantidad" } } }
      ]);
      const salidas = await Salida.aggregate([
        { $match: { productoId } },
        { $group: { _id: null, total: { $sum: "$cantidad" } } }
      ]);
      const vendidos = await Vendidos.aggregate([
        { $match: { productoId } },
        { $group: { _id: null, total: { $sum: "$cantidad" } } }
      ]);
      productosReales.push({
        ...p.toObject(),
        totalEntradas: entradas?.[0]?.total || 0,
        totalSalidas: salidas?.[0]?.total || 0,
        totalVendidos: vendidos?.[0]?.total || 0
      });
    }
    res.json({
      ok: true,
      productos: productosReales
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: "Error cargando inventario" });
  }
});




/*
  POST /api/inventario
  Crea una toma nueva
*/
router.post("/", async (req, res) => {
  try {
    const { fecha, productoId, stockSistema, stockFisico, observacion } = req.body;

    const nuevo = await Inventario.create({
      fecha,
      productoId,
      stockSistema,
      stockFisico,
      observacion
    });

    res.json({ ok: true, registro: nuevo });

  } catch (error) {
    console.error("Error POST inventario:", error);
    res.status(500).json({ ok: false, mensaje: "Error registrando toma" });
  }
});

/*
  PUT /api/inventario/:id
  Edita una toma existente
*/
router.put("/:id", async (req, res) => {
  try {
    const { stockFisico, observacion } = req.body;

    const actualizado = await Inventario.findByIdAndUpdate(
      req.params.id,
      { stockFisico, observacion },
      { new: true }
    );

    res.json({ ok: true, registro: actualizado });

  } catch (error) {
    console.error("Error PUT Inventario:", error);
    res.status(500).json({ ok: false, mensaje: "Error editando toma" });
  }
});

/*
  DELETE /api/Inventario/:id
  Elimina una toma existente
*/
router.delete("/:id", async (req, res) => {
  try {
    await Inventario.findByIdAndDelete(req.params.id);
    res.json({ ok: true });

  } catch (error) {
    console.error("Error DELETE inventario:", error);
    res.status(500).json({ ok: false, mensaje: "Error eliminando toma" });
  }
});

router.post("/guardar", async (req, res) => {
  try {
    const { fecha, categoria, items } = req.body;

    // 1. Borrar registros anteriores de esa fecha y categoría
    await Inventario.deleteMany({ fecha });

    // 2. Insertar todos los nuevos
    const nuevos = items.map(item => ({
      fecha,
      categoria,
      productoId: item.productoId,
      stockSistema: item.stockSistema,
      stockFisico: item.stockFisico,
      observacion: item.observacion || ""
    }));

    await Inventario.insertMany(nuevos);

    res.json({ ok: true, mensaje: "Inventario guardado correctamente" });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/stock-real/:codigo", async (req, res) => {
  try {
    const codigo = Number(req.params.codigo);

    // 1. Buscar el producto por código
    const producto = await Producto.findOne({ codigo });
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    const productoId = producto._id;

    // 2. Entradas
    const entradas = await Entrada.aggregate([
      { $match: { productoId } },
      { $group: { _id: null, total: { $sum: "$cantidad" } } }
    ]);

    // 3. Salidas
    const salidas = await Salida.aggregate([
      { $match: { productoId } },
      { $group: { _id: null, total: { $sum: "$cantidad" } } }
    ]);

    const totalEntradas = entradas?.[0]?.total || 0;
    const totalSalidas = salidas?.[0]?.total || 0;

    // 4. Stock real
    const stockReal = (producto.stock || 0) + totalEntradas - totalSalidas;

    // 5. Respuesta
    res.json({
      ok: true,
      codigo,
      stockInicial: producto.stock || 0,
      totalEntradas,
      totalSalidas,
      stockReal
    });

  } catch (error) {
    console.error("Error calculando stock real:", error);
    res.status(500).json({ ok: false, mensaje: "Error calculando stock real" });
  }
});

router.get("/debug-productos", async (req, res) => {
  try {
    const productos = await Producto.find({}); // ← TODOS los productos, TODOS los campos
    console.log("DEBUG PRODUCTOS:", productos);
    res.json(productos);
  } catch (error) {
    console.error("ERROR DEBUG PRODUCTOS:", error);
    res.status(500).json({ ok: false, mensaje: "Error debug productos" });
  }
});



export default router;