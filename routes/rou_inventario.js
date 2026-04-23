import express from "express";
import Inventario from "../models/dbInventario.js";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";

// Si ya tienes ventas, importa:
//import Venta from "../models/ventas.js";
// Si NO existe ventas aún, comenta esta línea

const router = express.Router();

/*
  GET /api/inventario?fecha=YYYY-MM-DD&categoria=ALB
  Devuelve productos + tomas existentes + stock final del sistema
*/
router.get("/", async (req, res) => {
  try {
    const { fecha, categoria } = req.query;

    if (!fecha || !categoria) {
      return res.status(400).json({ ok: false, mensaje: "Faltan parámetros" });
    }

    // Productos de la categoría
    const productos = await Producto.find({ categoria });

    // Fecha exacta
    const inicio = new Date(fecha);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(fecha);
    fin.setHours(23, 59, 59, 999);

    // Tomas existentes para esa fecha
    const tomas = await Inventario.find({
      fecha: { $gte: inicio, $lte: fin }
    });

    // Calcular stock final del sistema
    const productosConStock = [];

    for (const p of productos) {
      const stockInicial = Number(p.stock) || 0;

      const entradas = await Entrada.aggregate([
        { $match: { productoId: p._id.toString(), fecha: { $lte: fin } } },
        { $group: { _id: null, total: { $sum: "$cantidad" } } }
      ]);

      const salidas = await Salida.aggregate([
        { $match: { productoId: p._id.toString(), fecha: { $lte: fin } } },
        { $group: { _id: null, total: { $sum: "$cantidad" } } }
      ]);

      //let ventas = [];
      //try {
        //ventas = await Venta.aggregate([
          //{ $match: { productoId: p.codigo, fecha: { $lte: fin } } },
          //{ $group: { _id: null, total: { $sum: "$cantidad" } } }
        //]);
      //} catch (e) {
      //  ventas = [];
      //}

      const totalEntradas = entradas[0]?.total || 0;
      const totalSalidas = salidas[0]?.total || 0;
      const totalVentas = 0;
      //const totalVentas = ventas[0]?.total || 0;

      const stockFinalSistema =
        stockInicial + totalEntradas - totalSalidas - totalVentas;

      productosConStock.push({
        ...p._doc,
        stockFinalSistema
      });
    }

    res.json({
      ok: true,
      productos: productosConStock,
      tomas
    });

  } catch (error) {
    console.error("Error GET inventario:", error);
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

export default router;