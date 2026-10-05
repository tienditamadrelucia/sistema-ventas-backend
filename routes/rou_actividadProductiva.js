import express from "express";
import ActividadProductiva from "../models/dbListaProductiva.js";

const router = express.Router();

// =====================================================
// LISTAR ACTIVIDADES PRODUCTIVAS
// =====================================================

router.get("/", async (req, res) => {
  try {
    const actividades = await ActividadProductiva.find()
      .sort({ descripcion: 1 });

    res.json(actividades);

  } catch (error) {
    console.error("Error cargando actividades productivas:", error);

    res.status(500).json({
      ok: false,
      error: "Error cargando actividades productivas"
    });
  }
});

// =====================================================
// CREAR ACTIVIDAD PRODUCTIVA
// =====================================================

router.post("/", async (req, res) => {
  try {
    const descripcion = String(
      req.body.descripcion || ""
    )
      .trim()
      .toUpperCase();

    if (!descripcion) {
      return res.status(400).json({
        ok: false,
        error: "Debe ingresar una descripción"
      });
    }

    const existe = await ActividadProductiva.findOne({
      descripcion
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        error:
          "Ya existe una actividad productiva con esa descripción"
      });
    }

    const actividad = new ActividadProductiva({
      descripcion,
      activa: true
    });

    await actividad.save();

    res.json({
      ok: true,
      actividad
    });

  } catch (error) {
    console.error("Error creando actividad productiva:", error);

    res.status(500).json({
      ok: false,
      error: "Error creando actividad productiva"
    });
  }
});

// =====================================================
// EDITAR ACTIVIDAD PRODUCTIVA
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const descripcion = String(
      req.body.descripcion || ""
    )
      .trim()
      .toUpperCase();

    if (!descripcion) {
      return res.status(400).json({
        ok: false,
        error: "Debe ingresar una descripción"
      });
    }

    const duplicada = await ActividadProductiva.findOne({
      descripcion,
      _id: { $ne: req.params.id }
    });

    if (duplicada) {
      return res.status(400).json({
        ok: false,
        error:
          "Ya existe una actividad productiva con esa descripción"
      });
    }

    const actividad =
      await ActividadProductiva.findByIdAndUpdate(
        req.params.id,
        {
          descripcion
        },
        {
          new: true,
          runValidators: true
        }
      );

    if (!actividad) {
      return res.status(404).json({
        ok: false,
        error: "Actividad productiva no encontrada"
      });
    }

    res.json({
      ok: true,
      actividad
    });

  } catch (error) {
    console.error("Error editando actividad productiva:", error);

    res.status(500).json({
      ok: false,
      error: "Error editando actividad productiva"
    });
  }
});

// =====================================================
// ACTIVAR / DESACTIVAR
// =====================================================

router.patch("/:id/estado", async (req, res) => {
  try {
    const actividad =
      await ActividadProductiva.findByIdAndUpdate(
        req.params.id,
        {
          activa: Boolean(req.body.activa)
        },
        {
          new: true
        }
      );

    if (!actividad) {
      return res.status(404).json({
        ok: false,
        error: "Actividad productiva no encontrada"
      });
    }

    res.json({
      ok: true,
      actividad
    });

  } catch (error) {
    console.error(
      "Error cambiando estado de actividad productiva:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        "Error cambiando estado de la actividad productiva"
    });
  }
});

// =====================================================
// EXPORTAR ROUTER
// =====================================================

export default router;