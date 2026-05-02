import express from "express";
import TipoGastos from "../models/dbTipoGastos.js";
import Gastos from "../models/dbGastos.js";

const router = express.Router();

// Obtener todos
router.get("/", async (req, res) => {
  try {
    const tipos = await TipoGastos.find().sort({ descripcion: 1 });
    res.json(tipos);
  } catch (error) {
    console.error("Error listando tipos:", error);
    res.status(500).json({ ok: false, error: "Error listando tipos" });
  }
});

// Crear
router.post("/", async (req, res) => {
  try {
    req.body.descripcion = req.body.descripcion.toUpperCase(); // ⭐ NORMALIZAR

    const existe = await TipoGastos.findOne({
      descripcion: req.body.descripcion
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe un tipo de gasto con esa descripción"
      });
    }

    const nuevo = new TipoGastos(req.body);
    const guardado = await nuevo.save();

    res.json({ ok: true, tipo: guardado });

  } catch (error) {
    console.error("Error creando tipo:", error);
    res.status(400).json({ ok: false, error: "No se pudo crear" });
  }
});

// Actualizar
router.put("/:id", async (req, res) => {
  try {
    req.body.descripcion = req.body.descripcion.toUpperCase(); // ⭐ NORMALIZAR

    const existe = await TipoGastos.findOne({
      descripcion: req.body.descripcion,
      _id: { $ne: req.params.id }
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe otro tipo de gasto con esa descripción"
      });
    }

    const actualizado = await TipoGastos.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ ok: true, tipo: actualizado });

  } catch (error) {
    console.error("Error actualizando tipo:", error);
    res.status(400).json({ ok: false, error: "No se pudo actualizar" });
  }
});

// Eliminar tipo de gasto
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // ⭐ Buscar si hay gastos asociados a este tipo
    const gastos = await Gastos.find({ tipo: id });
    if (gastos.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar este tipo de gasto porque tiene gastos asociados"
      });
    }
    // ⭐ Si no tiene gastos → eliminar
    await TipoGastos.findByIdAndDelete(id);
    res.json({ ok: true, mensaje: "Tipo de gasto eliminado" });
  } catch (error) {
    console.error("Error eliminando tipo:", error);
    res.status(500).json({ ok: false, error: "Error eliminando tipo de gasto" });
  }
});


export default router;
