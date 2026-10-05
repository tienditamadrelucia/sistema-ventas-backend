import express from "express";
import TipoIngresos from "../models/dbTipoIngresos.js";
import Ingresos from "../models/dbIngresos.js";

const router = express.Router();

// Obtener todos
router.get("/", async (req, res) => {
  try {
    const tipos = await TipoIngresos.find().sort({ descripcion: 1 });
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
    const existe = await TipoIngresos.findOne({
      descripcion: req.body.descripcion
    });
    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe un tipo de ingreso con esa descripción"
      });
    }
    const nuevo = new TipoIngresos(req.body);
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
    const existe = await TipoIngresos.findOne({
      descripcion: req.body.descripcion,
      _id: { $ne: req.params.id }
    });
    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe otro tipo de ingreso con esa descripción"
      });
    }
    const actualizado = await TipoIngresos.findByIdAndUpdate(
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

// Eliminar tipo de ingreso
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Buscar el tipo de ingreso
    const tipo = await TipoIngresos.findById(id);
    if (!tipo) {
      return res.status(404).json({ ok: false, error: "Tipo de ingreso no encontrado" });
    }
    // 2. Buscar ingresos cuya descripción coincida con la descripción del tipo
    const ingresos = await Ingresos.find({ descripcion: tipo.descripcion });
    if (ingresos.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar este tipo de ingreso porque tiene ingresos asociados"
      });
    }
    // 3. Eliminar si no tiene ingresos
    await TipoIngresos.findByIdAndDelete(id);
    res.json({ ok: true, mensaje: "Tipo de ingreso eliminado" });
  } catch (error) {
    console.error("Error eliminando tipo:", error);
    res.status(500).json({ ok: false, error: "Error eliminando tipo de ingreso" });
  }
});


export default router;
