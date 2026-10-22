import express from "express";
import Entrada from "../models/Entrada.js";
import Producto from "../models/Producto.js";

const router = express.Router();

const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};

// -------------------------------------------------------------
// GET paginado (incluye costo y venta del producto)
// -------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const sede = req.query.sede || "TIENDITA";
    const filtro = filtroPorSede(sede);

    const total = await Entrada.countDocuments(filtro);

    const entradas = await Entrada.find(filtro)
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productoId", "codigo descripcion categoria costo venta sede");

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
        if (req.body.observacion === "COMPRAS") {
      return res.status(400).json({
        ok: false,
        error:
          "Registre las compras desde Gastos → Registrar compra para reventa. Allí se generan las entradas automáticamente."
      });
    }
    const {
  fecha,
  categoria,
  productoId,
  codigo,
  cantidad,
  observacion,
  precioCompra,
  precioVenta,
  sede
} = req.body;

const sedeFinal = sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    }
    const sedeProducto =
     producto.sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";
      if (sedeProducto !== sedeFinal) {
        return res.status(400).json({
        ok: false,
        error: "El producto no pertenece a la sede seleccionada."
      });
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
      precioCompraFinal = 0;
      precioVentaFinal = Number(precioVenta || producto.venta || 0);

      if (precioVentaFinal <= 0) {
        return res.status(400).json({
          ok: false,
          error: "Debe ingresar el precio de venta."
        });
      }
    }

    // ⭐ Otros motivos → no se usan precios
    else {
      precioCompraFinal = null;
      precioVentaFinal = null;
    }

    // ⭐ ACTUALIZAR PRODUCTO SEGÚN EL TIPO DE ENTRADA
    if (observacion === "PRODUCCIÓN DEL MONASTERIO") {
      producto.costo = 0;
      producto.venta = Number(precioVentaFinal);
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
      precioVenta: precioVentaFinal,
      sede: sedeFinal
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
        const entradaActual = await Entrada.findById(req.params.id);

    if (!entradaActual) {
      return res.status(404).json({
        ok: false,
        error: "Entrada no encontrada"
      });
    }

    if (entradaActual.cierre === "S") {
      return res.status(409).json({
        ok: false,
        error: "Esta entrada pertenece a un período cerrado."
      });
    }

    if (entradaActual.gastoId) {
      return res.status(409).json({
        ok: false,
        error:
          "Esta entrada pertenece a una compra. No puede modificarse por separado."
      });
    }
    if (
      entradaActual.observacion === "COMPRAS" ||
      req.body.observacion === "COMPRAS"
    ) {
      return res.status(409).json({
        ok: false,
        error:
          "Las compras no pueden modificarse desde Entradas porque afectan el costo de los productos."
      });
    }
    const {
  fecha,
  categoria,
  productoId,
  codigo,
  cantidad,
  observacion,
  precioCompra,
  precioVenta,
  sede
} = req.body;

const sedeFinal = sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    }

    const sedeProducto =
      producto.sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

      if (sedeProducto !== sedeFinal) {
        return res.status(400).json({
        ok: false,
        error: "El producto no pertenece a la sede seleccionada."
      });
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
      precioCompraFinal = 0;
      precioVentaFinal = Number(precioVenta || producto.venta || 0);

      if (precioVentaFinal <= 0) {
        return res.status(400).json({
          ok: false,
          error: "Debe ingresar el precio de venta."
        });
      }
    }

    // ⭐ Otros motivos
    else {
      precioCompraFinal = null;
      precioVentaFinal = null;
    }

    // ⭐ ACTUALIZAR PRODUCTO SEGÚN EL TIPO DE ENTRADA
    if (observacion === "PRODUCCIÓN DEL MONASTERIO") {
      producto.costo = 0;
      producto.venta = Number(precioVentaFinal);
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
        precioVenta: precioVentaFinal,
        sede: sedeFinal
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
    const entrada = await Entrada.findById(req.params.id);

    if (!entrada) {
      return res.status(404).json({
        ok: false,
        error: "Entrada no encontrada"
      });
    }

    if (entrada.cierre === "S") {
      return res.status(409).json({
        ok: false,
        error: "Esta entrada pertenece a un período cerrado."
      });
    }

    if (entrada.gastoId) {
      return res.status(409).json({
        ok: false,
        error:
          "Esta entrada pertenece a una compra. No puede eliminarse por separado."
      });
    }

    if (entrada.observacion === "COMPRAS") {
      return res.status(409).json({
        ok: false,
        error:
          "Esta entrada corresponde a una compra y afecta el costo del producto. No puede eliminarse desde esta opción."
      });
    }

    const eliminado = await Entrada.findOneAndDelete({
      _id: entrada._id,
      cierre: { $ne: "S" },
      gastoId: null,
      observacion: { $ne: "COMPRAS" }
    });

    if (!eliminado) {
      return res.status(409).json({
        ok: false,
        error:
          "La entrada cambió mientras se intentaba eliminar. Actualice la lista."
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando entrada:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo eliminar la entrada."
    });
  }
});

// -------------------------------------------------------------
// REPORTE
// -------------------------------------------------------------
router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta, sede } = req.query;

    const sedeActual = sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sedeActual)) {
      return res.status(400).json({
        error: "Sede inválida"
      });
    }

    // =====================================================
    // FILTRO POR SEDE
    // TIENDITA incluye registros antiguos sin campo sede
    // =====================================================
    const filtroSede =
      sedeActual === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    const filtro = {
      ...filtroSede
    };

    // =====================================================
    // FILTRO DE FECHAS
    // =====================================================
    if (desde && hasta) {
      const fechaDesde = new Date(`${desde}T00:00:00`);
      const fechaHasta = new Date(`${hasta}T23:59:59.999`);

      filtro.fecha = {
        $gte: fechaDesde,
        $lte: fechaHasta
      };
    }

    // =====================================================
    // CONSULTAR ENTRADAS
    // =====================================================
    const entradas = await Entrada.find(filtro)
      .populate(
        "productoId",
        "codigo descripcion categoria costo venta"
      )
      .sort({ fecha: 1 });

    return res.json(entradas);

  } catch (error) {
    console.error("Error en reporte de entradas:", error);

    return res.status(500).json({
      error: "Error generando reporte"
    });
  }
});
export default router;
