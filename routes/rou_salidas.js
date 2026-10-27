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

// =====================================================
// MODIFICAR SALIDAS COMUNES
// =====================================================
router.put("/:id", async (req, res) => {
  try {
    const salida = await dbSalidas.findById(req.params.id);

    if (!salida) {
      return res.status(404).json({
        ok: false,
        mensaje: "Salida no encontrada."
      });
    }

    if (salida.consumoId || salida.loteId) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta salida pertenece a un lote de producción. No puede modificarse desde Salidas."
      });
    }

    if (salida.cierre === "S") {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta salida pertenece a un período cerrado."
      });
    }

    const { fecha, cantidad, sede } = req.body;

    const sedeFinal =
      sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    const sedeSalida =
      salida.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    if (sedeSalida !== sedeFinal) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "La salida no pertenece a la sede seleccionada."
      });
    }

    const fechaFinal = new Date(fecha);

    const cantidadFinal =
      typeof cantidad === "number" ||
      (
        typeof cantidad === "string" &&
        cantidad.trim() !== ""
      )
        ? Number(cantidad)
        : NaN;

    if (
      !Number.isFinite(fechaFinal.getTime()) ||
      !Number.isFinite(cantidadFinal) ||
      cantidadFinal <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Indique una fecha válida y una cantidad mayor que cero."
      });
    }

    const actualizada = await dbSalidas.findOneAndUpdate(
      {
        _id: salida._id,
        cierre: { $ne: "S" },
        loteId: null,
        consumoId: null
      },
      {
        $set: {
          fecha: fechaFinal,
          cantidad: cantidadFinal,
          sede: sedeSalida
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    );

    if (!actualizada) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "La salida cambió mientras se intentaba modificar. Actualice la lista."
      });
    }

    return res.json({
      ok: true,
      Salida: actualizada
    });
  } catch (error) {
    console.error("Error actualizando salida:", error);

    return res.status(400).json({
      ok: false,
      mensaje: "No se pudo actualizar la salida."
    });
  }
});

// =====================================================
// ELIMINAR SALIDAS COMUNES
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const salida = await dbSalidas.findById(req.params.id);

    if (!salida) {
      return res.status(404).json({
        ok: false,
        mensaje: "Salida no encontrada."
      });
    }

    if (salida.consumoId || salida.loteId) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta salida pertenece a un lote de producción. No puede eliminarse desde Salidas."
      });
    }

    if (salida.cierre === "S") {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta salida pertenece a un período cerrado."
      });
    }

    const eliminada = await dbSalidas.findOneAndDelete({
      _id: salida._id,
      cierre: { $ne: "S" },
      loteId: null,
      consumoId: null
    });

    if (!eliminada) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "La salida cambió mientras se intentaba eliminar. Actualice la lista."
      });
    }

    return res.json({
      ok: true
    });
  } catch (error) {
    console.error("Error eliminando salida:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo eliminar la salida."
    });
  }
});

export default router;