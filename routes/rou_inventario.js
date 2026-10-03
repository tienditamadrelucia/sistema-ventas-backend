import express from "express";
import Inventario from "../models/dbInventario.js";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import mongoose from "mongoose";


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
    const { categoria } = req.query;
    const sede = req.query.sede || "TIENDITA";

    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    const productos = await Producto.find({
      categoria,
      ...filtroSede
    });

    const productosReales = [];

    for (const p of productos) {
      const productoId = p._id;

      const entradas = await Entrada.aggregate([
        {
          $match: {
            productoId,
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      const salidas = await Salida.aggregate([
        {
          $match: {
            productoId,
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      const vendidos = await Vendidos.aggregate([
        {
          $match: {
            productoId,
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
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

    res.status(500).json({
      ok: false,
      mensaje: "Error cargando inventario"
    });
  }
});

router.get("/buscar", async (req, res) => {
  try {
    const { fecha, categoria } = req.query;
    const sede = req.query.sede || "TIENDITA";

    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    // 1. Buscar inventario guardado de esta sede
    const inventario = await Inventario.find({
      fecha,
      categoria,
      ...filtroSede
    });

    if (inventario.length === 0) {
      return res.json([]);
    }

    // 2. Buscar productos relacionados
    const productosIds = inventario.map(i => i.productoId);

    const productos = await Producto.find({
      _id: { $in: productosIds },
      ...filtroSede
    });

    // 3. Unir inventario + productos
    const resultado = inventario.map(item => {
      const prod = productos.find(
        p => p._id.toString() === item.productoId
      );

      return {
        productoId: item.productoId,
        codigo: prod?.codigo || "",
        descripcion: prod?.descripcion || "",
        foto: prod?.foto || "",
        stockReal: item.stockReal,

        stockFisico:
          item.stockFisico === "" ||
          item.stockFisico === null ||
          item.stockFisico === undefined
            ? ""
            : Number(item.stockFisico),

        observacion: item.observacion
      };
    });

    resultado.sort((a, b) =>
      String(a.codigo).localeCompare(
        String(b.codigo),
        "es",
        { numeric: true }
      )
    );

    res.json(resultado);

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
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

router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const sede = req.query.sede || "TIENDITA";

    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe enviar ambas fechas"
      });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida"
      });
    }

    const inicio = new Date(desde + "T00:00:00");
    const fin = new Date(hasta + "T23:59:59");

    // Los registros antiguos sin sede pertenecen a TIENDITA
    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    // Productos solamente de esta sede
    const productos = await Producto.find({
      ...filtroSede
    }).sort({
      categoria: 1,
      codigo: 1
    });

    const resultado = [];

    for (const p of productos) {
      const productoId = p._id;

      // =====================================
      // 1. ENTRADAS DENTRO DEL RANGO
      // =====================================
      const entradas = await Entrada.aggregate([
        {
          $match: {
            productoId,
            fecha: { $gte: inicio, $lte: fin },
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      // =====================================
      // 2. SALIDAS DENTRO DEL RANGO
      // =====================================
      const salidas = await Salida.aggregate([
        {
          $match: {
            productoId,
            fecha: { $gte: inicio, $lte: fin },
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      // =====================================
      // 3. VENTAS DENTRO DEL RANGO
      // =====================================
      const vendidosLista = await Vendidos.find({
        productoId,
        fecha: { $gte: inicio, $lte: fin },
        ...filtroSede
      });

      let totalVendidosValidos = 0;

      for (const v of vendidosLista) {
        const venta = await Ventas.findOne({
          factura: v.factura,
          ...filtroSede
        });

        if (!venta) continue;

        if (venta.estado === "CONTADO") {
          totalVendidosValidos += v.cantidad;
          continue;
        }

        if (
          venta.estado === "CREDITO" &&
          venta.restaUSD <= 0
        ) {
          totalVendidosValidos += v.cantidad;
        }
      }

      // =====================================
      // 4. MOVIMIENTOS POSTERIORES AL RANGO
      // =====================================

      const entradasPosteriores = await Entrada.aggregate([
        {
          $match: {
            productoId,
            fecha: { $gt: fin },
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      const salidasPosteriores = await Salida.aggregate([
        {
          $match: {
            productoId,
            fecha: { $gt: fin },
            ...filtroSede
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$cantidad" }
          }
        }
      ]);

      const ventasPosterioresLista = await Vendidos.find({
        productoId,
        fecha: { $gt: fin },
        ...filtroSede
      });

      let ventasPosteriores = 0;

      for (const v of ventasPosterioresLista) {
        const venta = await Ventas.findOne({
          factura: v.factura,
          ...filtroSede
        });

        if (!venta) continue;

        if (venta.estado === "CONTADO") {
          ventasPosteriores += v.cantidad;
        }

        if (
          venta.estado === "CREDITO" &&
          venta.restaUSD <= 0
        ) {
          ventasPosteriores += v.cantidad;
        }
      }

      // =====================================
      // 5. STOCK INICIAL DEL RANGO
      // =====================================

      const stockInicial =
        (p.stock || 0)
        - (entradasPosteriores?.[0]?.total || 0)
        + (salidasPosteriores?.[0]?.total || 0)
        + ventasPosteriores;

      const totalEntradas =
        entradas?.[0]?.total || 0;

      const totalSalidas =
        salidas?.[0]?.total || 0;

      // =====================================
      // 6. STOCK REAL DEL RANGO
      // =====================================

      const stockReal =
        stockInicial
        + totalEntradas
        - totalSalidas
        - totalVendidosValidos;

      if (stockReal > 0) {
        resultado.push({
          _id: p._id,
          codigo: p.codigo,
          categoria: p.categoria,
          descripcion: p.descripcion,
          costo: p.costo,
          venta: p.venta,
          stockReal
        });
      }
    }

    res.json(resultado);

  } catch (error) {
    console.error(
      "Error generando reporte de inventario:",
      error
    );

    res.status(500).json({
      ok: false,
      mensaje: "Error generando reporte de inventario"
    });
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
    const { fecha, categoria, items, sede } = req.body;

    if (!fecha || !categoria || !sede) {
      return res.status(400).json({
        ok: false,
        error: "Fecha, categoría y sede son obligatorios"
      });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    // Borrar solamente la toma anterior de ESTA sede
    await Inventario.deleteMany({
      fecha,
      categoria,
      ...filtroSede
    });

    console.log(
      `Borró inventario anterior de ${sede}: ${fecha} / ${categoria}`
    );

    // Insertar todos los registros identificando la sede
    const nuevos = items.map(item => ({
      fecha,
      categoria,
      sede,
      productoId: item.productoId,
      stockReal: item.stockReal,

      stockFisico:
        item.stockFisico === ""
          ? ""
          : Number(item.stockFisico),

      observacion: item.observacion || ""
    }));

    await Inventario.insertMany(nuevos);

    res.json({
      ok: true,
      mensaje: `Inventario de ${sede} guardado correctamente`
    });

  } catch (error) {
    console.error("Error guardando inventario:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get("/stock-real/:codigo", async (req, res) => {
  try {
    const codigo = Number(req.params.codigo);
    const sede = req.query.sede || "TIENDITA";

    // 1. Buscar producto
    const producto = await Producto.findOne({ codigo, sede });

    if (!producto) {
      return res.status(404).json({
        ok: false,
        mensaje: "Producto no encontrado"
      });
    }

    const productoId = producto._id;

    // 2. Entradas de esta sede
    const entradas = await Entrada.aggregate([
      {
        $match: {
          productoId,
          sede
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$cantidad" }
        }
      }
    ]);

    // 3. Salidas de esta sede
    const salidas = await Salida.aggregate([
      {
        $match: {
          productoId,
          sede
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$cantidad" }
        }
      }
    ]);

    // 4. Ventas de esta sede
    const ventas = await Vendidos.aggregate([
      {
        $match: {
          productoId,
          sede
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$cantidad" }
        }
      }
    ]);

    const totalEntradas = entradas?.[0]?.total || 0;
    const totalSalidas = salidas?.[0]?.total || 0;
    const totalVentas = ventas?.[0]?.total || 0;

    // 5. Calcular stock
    const stockReal =
      (producto.stock || 0) +
      totalEntradas -
      totalSalidas -
      totalVentas;

    return res.json({
      ok: true,
      sede,
      codigo,
      stockInicial: producto.stock || 0,
      totalEntradas,
      totalSalidas,
      totalVentas,
      stockReal
    });

  } catch (error) {
    console.error("Error calculando stock real:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "Error calculando stock real"
    });
  }
});

router.get("/debug-productos", async (req, res) => {
  try {
    const productos = await Producto.find({}); // ← TODOS los productos, TODOS los campos    
    res.json(productos);
  } catch (error) {
    console.error("ERROR DEBUG PRODUCTOS:", error);
    res.status(500).json({ ok: false, mensaje: "Error debug productos" });
  }
});



export default router;