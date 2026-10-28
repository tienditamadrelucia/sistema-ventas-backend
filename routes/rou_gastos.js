import express from "express";
import dbGastos from "../models/dbGastos.js";
import { guardarCompraReventa } from "../controllers/compraReventa.js";
import {
  protegerEscrituras
} from "../utils/controlCaja.js";

const router = express.Router();

function intentaAsignarLotes(body = {}) {
  return (
    Object.prototype.hasOwnProperty.call(
      body,
      "asignacionesLotes"
    ) ||
    Object.prototype.hasOwnProperty.call(
      body,
      "asignacionesGallinas"
    )
  );
}

const CLASIFICACIONES_VALIDAS = [
  "SIN_CLASIFICAR",
  "GASTO_OPERATIVO",
  "COSTO_PRODUCCION",
  "TRANSFERENCIA_PARTICIPACION",
  "SUELDOS_PERSONAL"
];

// ==========================================
// FILTRO POR SEDE
// TIENDITA incluye registros históricos sin sede
// ==========================================
const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") return { sede: "MONASTERIO" };

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};

// ==========================================
// NORMALIZAR CLASIFICACIÓN
// ==========================================
const prepararClasificacion = (body) => {
  const clasificacion = body.clasificacion || "SIN_CLASIFICAR";

  if (!CLASIFICACIONES_VALIDAS.includes(clasificacion)) {
    return { error: "La clasificación del gasto no es válida." };
  }

  if (clasificacion === "COSTO_PRODUCCION") {
    if (!body.actividadProductiva) {
      return {
        error: "Debe seleccionar la actividad productiva correspondiente al costo."
      };
    }

    return {
      clasificacion,
      actividadProductiva: body.actividadProductiva
    };
  }

  return {
    clasificacion,
    actividadProductiva: null
  };
};

// ==========================================
// CREAR GASTO
// ==========================================
router.post("/", async (req, res) => {
  if (intentaAsignarLotes(req.body)) {
  return res.status(400).json({
    ok: false,
    mensaje:
      "Las asignaciones a lotes deben realizarse desde Gastos del lote."
  });
}
  try {
        if (
      req.body.clasificacion === "COMPRA_REVENTA" ||
      Object.prototype.hasOwnProperty.call(req.body, "compraReventa")
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Las compras para reventa deben guardarse mediante el formulario de compras."
      });
    }
    let { numeroRecibo, sede = "TIENDITA" } = req.body;

    sede = sede === "MONASTERIO" ? "MONASTERIO" : "TIENDITA";

    const datosClasificacion = prepararClasificacion(req.body);

    if (datosClasificacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: datosClasificacion.error
      });
    }

    if (!numeroRecibo || numeroRecibo === "0" || numeroRecibo === 0) {
      numeroRecibo = null;
    }

    if (numeroRecibo) {
      const existe = await dbGastos.findOne({
        numeroRecibo,
        sede,
        cierre: "N"
      });

      if (existe) {
        return res.status(400).json({
          ok: false,
          mensaje: "Ya existe un gasto con ese número de recibo"
        });
      }
    }

    const nuevo = new dbGastos({
  fecha: req.body.fecha,
  descripcion: req.body.descripcion,
  moneda: req.body.moneda,
  monto: req.body.monto,
  cajaChica: req.body.cajaChica,
  usuario: req.body.usuario,
  sede,
  numeroRecibo: numeroRecibo || null,
  clasificacion: datosClasificacion.clasificacion,
  actividadProductiva:
    datosClasificacion.actividadProductiva
});

    await nuevo.save();

    const gastoGuardado = await dbGastos
      .findById(nuevo._id)
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])

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
    const sede = req.query.sede === "MONASTERIO"
      ? "MONASTERIO"
      : "TIENDITA";

    const lista = await dbGastos
      .find(filtroPorSede(sede))
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])
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

    const sede = req.query.sede === "MONASTERIO"
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
        fecha: { $gte: inicio, $lte: fin },
        ...filtroPorSede(sede)
      })
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])
      .sort({ fecha: 1 });

    res.json(gastos);

  } catch (error) {
    console.error("Error generando reporte de gastos:", error);

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
    const sede = req.query.sede === "MONASTERIO"
      ? "MONASTERIO"
      : "TIENDITA";

    const dia = new Date(req.params.dia);
    const siguiente = new Date(dia);
    siguiente.setDate(siguiente.getDate() + 1);

    const lista = await dbGastos
      .find({
        fecha: { $gte: dia, $lt: siguiente },
        cajaChica: true,
        ...filtroPorSede(sede)
      })
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])

    return res.json({
      ok: true,
      lista
    });

  } catch (error) {
    console.error("Error buscando gastos por fecha:", error);

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
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])

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
    const gastoActual = await dbGastos.findById(req.params.id);

    if (!gastoActual) {
      return res.status(404).json({
        ok: false,
        error: "Gasto no encontrado"
      });
    }

    if (intentaAsignarLotes(req.body)) {
  return res.status(400).json({
    ok: false,
    mensaje:
      "Las asignaciones a lotes deben realizarse desde Gastos del lote."
  });
}

if (
  gastoActual.asignacionesLotes?.length ||
  gastoActual.asignacionesGallinas?.length
) {
  return res.status(409).json({
    ok: false,
    mensaje:
      "Este gasto está vinculado a producción. No puede modificarse desde el formulario común."
  });
}

        if (gastoActual.cierre === "S") {
      return res.status(409).json({
        ok: false,
        mensaje: "Este gasto pertenece a un período cerrado."
      });
    }

    if (
      gastoActual.compraReventa ||
      gastoActual.clasificacion === "COMPRA_REVENTA"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta compra tiene entradas y costos asociados. No puede editarse como un gasto común."
      });
    }

    if (
      req.body.clasificacion === "COMPRA_REVENTA" ||
      Object.prototype.hasOwnProperty.call(req.body, "compraReventa")
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "No puede convertir un gasto existente en una compra desde esta opción."
      });
    }

    const sede = gastoActual.sede === "MONASTERIO"
      ? "MONASTERIO"
      : "TIENDITA";

    const datosClasificacion = prepararClasificacion(req.body);

    if (datosClasificacion.error) {
      return res.status(400).json({
        ok: false,
        mensaje: datosClasificacion.error
      });
    }

    let numeroRecibo = req.body.numeroRecibo;

    if (!numeroRecibo || numeroRecibo === "0" || numeroRecibo === 0) {
      numeroRecibo = null;
    }

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
          mensaje: "Ya existe un gasto con ese número de recibo"
        });
      }
    }

    const actualizado = await dbGastos
  .findOneAndUpdate(
    {
      _id: gastoActual._id,
      cierre: { $ne: "S" },
      clasificacion: { $ne: "COMPRA_REVENTA" },
      compraReventa: null,
      "asignacionesGallinas.0": {
  $exists: false
},
"asignacionesLotes.0": {
  $exists: false
}
    },
    {
      $set: {
        fecha: req.body.fecha,
        descripcion: req.body.descripcion,
        moneda: req.body.moneda,
        monto: req.body.monto,
        cajaChica: req.body.cajaChica,
        usuario: req.body.usuario,
        sede,
        numeroRecibo: numeroRecibo || null,
        clasificacion: datosClasificacion.clasificacion,
        actividadProductiva:
          datosClasificacion.actividadProductiva
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )
      .populate([
  {
    path: "actividadProductiva",
    select: "descripcion activa"
  },
  {
    path: "compraReventa.detalles.actividadProductiva",
    select: "descripcion activa"
  }
])

    if (!actualizado) {
  return res.status(409).json({
    ok: false,
    mensaje:
      "El gasto cambió mientras se intentaba modificar. Actualice la lista."
  });
}

return res.json({
  ok: true,
  gasto: actualizado
});

  } catch (error) {
    console.error("Error actualizando gasto:", error);

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
    const gasto = await dbGastos.findById(req.params.id);

    if (!gasto) {
      return res.status(404).json({
        ok: false,
        mensaje: "Gasto no encontrado"
      });
    }

    if (
  gasto.asignacionesLotes?.length ||
  gasto.asignacionesGallinas?.length
) {
  return res.status(409).json({
    ok: false,
    mensaje:
      "Este gasto está vinculado a producción. No puede eliminarse desde el formulario común."
  });
}

    if (gasto.cierre === "S") {
      return res.status(409).json({
        ok: false,
        mensaje: "Este gasto pertenece a un período cerrado."
      });
    }

    if (
      gasto.compraReventa ||
      gasto.clasificacion === "COMPRA_REVENTA"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "Esta compra tiene entradas y costos asociados. No puede eliminarse como un gasto común."
      });
    }

    const eliminado = await dbGastos.findOneAndDelete({
  _id: gasto._id,
  cierre: { $ne: "S" },
  clasificacion: { $ne: "COMPRA_REVENTA" },
  compraReventa: null,
  "asignacionesGallinas.0": {
  $exists: false
},
"asignacionesLotes.0": {
  $exists: false
}
});

    if (!eliminado) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "El gasto cambió mientras se intentaba eliminar. Actualice la lista."
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando gasto:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo eliminar el gasto."
    });
  }
});

export default router;