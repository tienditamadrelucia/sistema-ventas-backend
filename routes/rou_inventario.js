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

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida"
      });
    }

    const convertirFecha = (valor) => {
      if (
        typeof valor !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor)
      ) {
        return null;
      }

      const fecha = new Date(`${valor}T00:00:00.000Z`);

      if (
        !Number.isFinite(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== valor
      ) {
        return null;
      }

      return fecha;
    };

    const inicio = convertirFecha(desde);
    const ultimoDia = convertirFecha(hasta);

    if (!inicio || !ultimoDia || inicio > ultimoDia) {
      return res.status(400).json({
        ok: false,
        mensaje: "Seleccione un rango de fechas válido"
      });
    }

    const finExclusivo = new Date(ultimoDia);
    finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1);

    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    const productos = await Producto.find(filtroSede)
      .sort({ categoria: 1, codigo: 1 })
      .lean();

    const ids = productos.map((p) => p._id);

    // Las existencias a una fecha incluyen todos los
    // movimientos anteriores, no solo los del rango.
    const sumarMovimientos = async (Modelo) => {
      const filas = await Modelo.aggregate([
        {
          $match: {
            productoId: { $in: ids },
            fecha: { $lt: finExclusivo },
            ...filtroSede
          }
        },
        {
          $group: {
            _id: "$productoId",
            cantidad: { $sum: "$cantidad" }
          }
        }
      ]);

      return new Map(
        filas.map((fila) => [
          String(fila._id),
          Number(fila.cantidad)
        ])
      );
    };

    const entradas = await sumarMovimientos(Entrada);
    const salidas = await sumarMovimientos(Salida);

    // Usamos la fecha de la venta, porque los detalles
    // vendidos pueden no tener un campo fecha.
    // Incluye contado y crédito: ambos salen del inventario.
    const ventas = await Ventas.find({
      fecha: { $lt: finExclusivo },
      tipoMovimiento: { $ne: "OTRO_INGRESO" },
      ...filtroSede
    })
      .select("factura")
      .lean();

    const facturas = [
      ...new Set(
        ventas
          .map((venta) => venta.factura)
          .filter(
            (factura) =>
              factura !== null &&
              factura !== undefined
          )
      )
    ];

    const vendidosAgrupados = await Vendidos.aggregate([
      {
        $match: {
          productoId: { $in: ids },
          factura: { $in: facturas },
          ...filtroSede
        }
      },
      {
        $group: {
          _id: "$productoId",
          cantidad: { $sum: "$cantidad" }
        }
      }
    ]);

    const vendidos = new Map(
      vendidosAgrupados.map((fila) => [
        String(fila._id),
        Number(fila.cantidad)
      ])
    );

    const resultado = productos.map((producto) => {
      const id = String(producto._id);

      const stockReal =
        Number(producto.stock || 0) +
        (entradas.get(id) || 0) -
        (salidas.get(id) || 0) -
        (vendidos.get(id) || 0);

      return {
        _id: producto._id,
        codigo: producto.codigo,
        categoria: producto.categoria,
        descripcion: producto.descripcion,
        costo: producto.costo,
        venta: producto.venta,
        stockReal: Math.round(stockReal * 1000) / 1000
      };
    });

    // Incluye existencias cero y negativas para que
    // las diferencias no queden ocultas.
    return res.json(resultado);
  } catch (error) {
    console.error("Error generando reporte de inventario:", error);

    return res.status(500).json({
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