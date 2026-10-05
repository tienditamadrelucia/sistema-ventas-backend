import express from "express";
import dbIngresos from "../models/dbIngresos.js";

const router = express.Router();

// ==========================================
// CREAR INGRESO
// ==========================================
router.post("/", async (req, res) => {
  try {
    const {
      fecha,
      numeroReciboIngreso,
      tipoIngreso,
      descripcion = "",
      moneda,
      monto,
      usuario = ""
    } = req.body;

    if (!fecha || !numeroReciboIngreso?.trim() || !tipoIngreso || !moneda || !monto) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe completar fecha, recibo de ingreso, tipo de ingreso, moneda y monto."
      });
    }

    if (!["D", "P", "Bs"].includes(moneda)) {
      return res.status(400).json({
        ok: false,
        mensaje: "La moneda seleccionada no es válida."
      });
    }

    const montoNumero = Number(monto);

    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "El monto debe ser mayor que cero."
      });
    }

    const recibo = numeroReciboIngreso.trim();

    const existe = await dbIngresos.findOne({
      sede: "MONASTERIO",
      numeroReciboIngreso: recibo
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        mensaje: `Ya existe un ingreso con el Recibo N.º ${recibo}.`
      });
    }

    const nuevo = await dbIngresos.create({
      fecha,
      sede: "MONASTERIO",
      numeroReciboIngreso: recibo,
      tipoIngreso,
      descripcion: descripcion.trim(),
      moneda,
      monto: montoNumero,
      origen: "MANUAL",
      pagoParticipacion: null,
      usuario,
      cierre: "N"
    });

    const ingresoGuardado = await dbIngresos.findById(nuevo._id)
      .populate("tipoIngreso", "descripcion activo");

    res.json({
      ok: true,
      ingreso: ingresoGuardado
    });

  } catch (error) {
    console.error("Error creando ingreso:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error creando ingreso.",
      detalle: error.message
    });
  }
});

// ==========================================
// LISTAR INGRESOS DEL MONASTERIO
// ==========================================
router.get("/", async (req, res) => {
  try {
    const lista = await dbIngresos.find({
      sede: "MONASTERIO"
    })
      .populate("tipoIngreso", "descripcion activo")
      .sort({ fecha: -1, createdAt: -1 });

    res.json({
      ok: true,
      lista
    });

  } catch (error) {
    console.error("Error listando ingresos:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error listando ingresos."
    });
  }
});

// ==========================================
// REPORTE POR FECHAS
// ==========================================
router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe indicar fecha desde y hasta."
      });
    }

    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T23:59:59.999`);

    const ingresos = await dbIngresos.find({
      sede: "MONASTERIO",
      fecha: { $gte: inicio, $lte: fin }
    })
      .populate("tipoIngreso", "descripcion activo")
      .sort({ fecha: 1 });

    res.json({
      ok: true,
      lista: ingresos
    });

  } catch (error) {
    console.error("Error generando reporte de ingresos:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error generando reporte de ingresos.",
      detalle: error.message
    });
  }
});

// ==========================================
// OBTENER INGRESO POR ID
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const ingreso = await dbIngresos.findById(req.params.id)
      .populate("tipoIngreso", "descripcion activo");

    if (!ingreso) {
      return res.status(404).json({
        ok: false,
        mensaje: "Ingreso no encontrado."
      });
    }

    res.json({
      ok: true,
      ingreso
    });

  } catch (error) {
    console.error("Error obteniendo ingreso:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo ingreso."
    });
  }
});

// ==========================================
// MODIFICAR INGRESO
// ==========================================
router.put("/:id", async (req, res) => {
  try {
    const ingresoActual = await dbIngresos.findById(req.params.id);

    if (!ingresoActual) {
      return res.status(404).json({
        ok: false,
        mensaje: "Ingreso no encontrado."
      });
    }

    // Los ingresos provenientes de Participaciones no se editan aquí.
    if (ingresoActual.origen === "PARTICIPACION") {
      return res.status(400).json({
        ok: false,
        mensaje: "Los ingresos generados por participaciones no pueden modificarse desde este módulo."
      });
    }

    const {
      fecha,
      numeroReciboIngreso,
      tipoIngreso,
      descripcion = "",
      moneda,
      monto,
      usuario
    } = req.body;

    if (!fecha || !numeroReciboIngreso?.trim() || !tipoIngreso || !moneda || !monto) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe completar fecha, recibo de ingreso, tipo de ingreso, moneda y monto."
      });
    }

    if (!["D", "P", "Bs"].includes(moneda)) {
      return res.status(400).json({
        ok: false,
        mensaje: "La moneda seleccionada no es válida."
      });
    }

    const montoNumero = Number(monto);

    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "El monto debe ser mayor que cero."
      });
    }

    const recibo = numeroReciboIngreso.trim();

    const existe = await dbIngresos.findOne({
      _id: { $ne: req.params.id },
      sede: "MONASTERIO",
      numeroReciboIngreso: recibo
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        mensaje: `Ya existe un ingreso con el Recibo N.º ${recibo}.`
      });
    }

    ingresoActual.fecha = fecha;
    ingresoActual.numeroReciboIngreso = recibo;
    ingresoActual.tipoIngreso = tipoIngreso;
    ingresoActual.descripcion = descripcion.trim();
    ingresoActual.moneda = moneda;
    ingresoActual.monto = montoNumero;
    if (usuario !== undefined) ingresoActual.usuario = usuario;

    await ingresoActual.save();

    const actualizado = await dbIngresos.findById(ingresoActual._id)
      .populate("tipoIngreso", "descripcion activo");

    res.json({
      ok: true,
      ingreso: actualizado
    });

  } catch (error) {
    console.error("Error actualizando ingreso:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error actualizando ingreso.",
      detalle: error.message
    });
  }
});

// ==========================================
// ELIMINAR INGRESO
// ==========================================
router.delete("/:id", async (req, res) => {
  try {
    const ingreso = await dbIngresos.findById(req.params.id);

    if (!ingreso) {
      return res.status(404).json({
        ok: false,
        mensaje: "Ingreso no encontrado."
      });
    }

    // Protegemos los ingresos automáticos de Participaciones.
    if (ingreso.origen === "PARTICIPACION") {
      return res.status(400).json({
        ok: false,
        mensaje: "Los ingresos generados por participaciones no pueden eliminarse desde este módulo."
      });
    }

    await dbIngresos.findByIdAndDelete(req.params.id);

    res.json({
      ok: true
    });

  } catch (error) {
    console.error("Error eliminando ingreso:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error eliminando ingreso."
    });
  }
});

export default router;