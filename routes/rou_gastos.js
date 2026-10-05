import express from "express";
import dbGastos from "../models/dbGastos.js";

const router = express.Router();

const CLASIFICACIONES_VALIDAS = [
  "SIN_CLASIFICAR",
  "GASTO_OPERATIVO",
  "COSTO_PRODUCCION",
  "TRANSFERENCIA_PARTICIPACION", 
  "SUELDOS_PERSONAL"
];

// ==========================================
// NORMALIZAR CLASIFICACIÓN
// ==========================================
const prepararClasificacion = (body) => {
  const clasificacion =
    body.clasificacion || "SIN_CLASIFICAR";

  if (!CLASIFICACIONES_VALIDAS.includes(clasificacion)) {
    return {
      error: "La clasificación del gasto no es válida."
    };
  }

  // Si es costo de producción, la actividad es obligatoria
  if (clasificacion === "COSTO_PRODUCCION") {
    if (!body.actividadProductiva) {
      return {
        error:
          "Debe seleccionar la actividad productiva correspondiente al costo."
      };
    }

    return {
      clasificacion,
      actividadProductiva: body.actividadProductiva
    };
  }

  // Los demás tipos NO llevan actividad productiva
  return {
    clasificacion,
    actividadProductiva: null
  };
};


// ==========================================
// CREAR GASTO
// ==========================================
router.post("/", async (req, res) => {
  try {
    let {
      numeroRecibo,
      sede = "TIENDITA"
    } = req.body;

    // Normalizar sede
    sede =
      sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    // Validar clasificación
    const datosClasificacion =
      prepararClasificacion(req.body);

    if (datosClasificacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: datosClasificacion.error
      });
    }

    // Normalizar recibo vacío o 0
    if (
      !numeroRecibo ||
      numeroRecibo === "0" ||
      numeroRecibo === 0
    ) {
      numeroRecibo = null;
    }

    // Validar recibo duplicado
    if (numeroRecibo) {
      const existe = await dbGastos.findOne({
        numeroRecibo,
        sede,
        cierre: "N"
      });

      if (existe) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Ya existe un gasto con ese número de recibo"
        });
      }
    }

    const nuevo = new dbGastos({
      ...req.body,

      sede,

      numeroRecibo: numeroRecibo || null,

      clasificacion:
        datosClasificacion.clasificacion,

      actividadProductiva:
        datosClasificacion.actividadProductiva
    });

    await nuevo.save();

    const gastoGuardado =
      await dbGastos.findById(nuevo._id)
        .populate(
          "actividadProductiva",
          "descripcion activa"
        );

    res.json({
      ok: true,
      gasto: gastoGuardado
    });

  } catch (error) {
    console.error("Error creando gasto:", error);

    res.status(500).json({
      ok: false,
      error: "Error creando gasto"
    });
  }
});


// ==========================================
// LISTAR GASTOS
// ==========================================
router.get("/", async (req, res) => {
  try {
    const sede =
      req.query.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    const lista = await dbGastos
      .find({ sede })
      .populate(
        "actividadProductiva",
        "descripcion activa"
      )
      .sort({ fecha: -1 });

    res.json({
      ok: true,
      lista
    });

  } catch (error) {
    console.error("Error listando gastos:", error);

    res.status(500).json({
      ok: false,
      error: "Error listando gastos"
    });
  }
});


// ==========================================
// REPORTE DE GASTOS POR FECHAS
// ==========================================
router.get("/reporte", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    const sede =
      req.query.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe enviar fecha desde y hasta"
      });
    }

    const inicio = new Date(desde);

    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    const gastos = await dbGastos
      .find({
        fecha: {
          $gte: inicio,
          $lte: fin
        },
        sede
      })
      .populate(
        "actividadProductiva",
        "descripcion activa"
      )
      .sort({ fecha: 1 });

    res.json(gastos);

  } catch (error) {
    console.error(
      "Error generando reporte de gastos:",
      error
    );

    res.status(500).json({
      ok: false,
      mensaje: "Error generando reporte de gastos",
      detalle: error.message
    });
  }
});


// ==========================================
// GASTOS DE CAJA CHICA POR DÍA
// IMPORTANTE: antes de /:id
// ==========================================
router.get("/gastos/:dia", async (req, res) => {
  try {
    const sede =
      req.query.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    const dia = new Date(req.params.dia);

    const siguiente = new Date(dia);
    siguiente.setDate(siguiente.getDate() + 1);

    const lista = await dbGastos
      .find({
        fecha: {
          $gte: dia,
          $lt: siguiente
        },
        cajaChica: true,
        sede
      })
      .populate(
        "actividadProductiva",
        "descripcion activa"
      );

    return res.json({
      ok: true,
      lista
    });

  } catch (error) {
    console.error(
      "Error buscando gastos por fecha:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor"
    });
  }
});


// ==========================================
// OBTENER GASTO POR ID
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const gasto = await dbGastos
      .findById(req.params.id)
      .populate(
        "actividadProductiva",
        "descripcion activa"
      );

    if (!gasto) {
      return res.status(404).json({
        ok: false,
        error: "Gasto no encontrado"
      });
    }

    res.json({
      ok: true,
      gasto
    });

  } catch (error) {
    console.error("Error obteniendo gasto:", error);

    res.status(500).json({
      ok: false,
      error: "Error obteniendo gasto"
    });
  }
});


// ==========================================
// MODIFICAR GASTO
// ==========================================
router.put("/:id", async (req, res) => {
  try {
    const gastoActual =
      await dbGastos.findById(req.params.id);

    if (!gastoActual) {
      return res.status(404).json({
        ok: false,
        error: "Gasto no encontrado"
      });
    }

    // Conservamos la sede original
    const sede =
      gastoActual.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    // Validar clasificación
    const datosClasificacion =
      prepararClasificacion(req.body);

    if (datosClasificacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: datosClasificacion.error
      });
    }

    let numeroRecibo = req.body.numeroRecibo;

    if (
      !numeroRecibo ||
      numeroRecibo === "0" ||
      numeroRecibo === 0
    ) {
      numeroRecibo = null;
    }

    // Validar duplicado excluyendo el gasto actual
    if (numeroRecibo) {
      const existe = await dbGastos.findOne({
        _id: { $ne: req.params.id },
        numeroRecibo,
        sede,
        cierre: "N"
      });

      if (existe) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Ya existe un gasto con ese número de recibo"
        });
      }
    }

    const actualizado =
      await dbGastos.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,

          // No permitimos cambiar de sede
          sede,

          numeroRecibo: numeroRecibo || null,

          clasificacion:
            datosClasificacion.clasificacion,

          actividadProductiva:
            datosClasificacion.actividadProductiva
        },
        {
          new: true,
          runValidators: true
        }
      ).populate(
        "actividadProductiva",
        "descripcion activa"
      );

    res.json({
      ok: true,
      gasto: actualizado
    });

  } catch (error) {
    console.error(
      "Error actualizando gasto:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Error actualizando gasto"
    });
  }
});


// ==========================================
// ELIMINAR GASTO
// ==========================================
router.delete("/:id", async (req, res) => {
  try {
    const gasto =
      await dbGastos.findByIdAndDelete(req.params.id);

    if (!gasto) {
      return res.status(404).json({
        ok: false,
        error: "Gasto no encontrado"
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {
    console.error("Error eliminando gasto:", error);

    res.status(500).json({
      ok: false,
      error: "Error eliminando gasto"
    });
  }
});

export default router;