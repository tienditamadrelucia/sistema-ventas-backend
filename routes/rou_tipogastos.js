import express from "express";
import TipoGastos from "../models/TipoGastos.js";

const router = express.Router();

// Obtener todos
router.get("/", async (req, res) => {
  const tipos = await TipoGastos.find().sort({ descripcion: 1 });
  res.json(tipos);
});

// Crear
router.post("/", async (req, res) => {
  try {
    const nuevo = new TipoGastos(req.body);
    const guardado = await nuevo.save();
    res.json({ ok: true, tipo: guardado });
  } catch (error) {
    res.status(400).json({ ok: false, error: "No se pudo crear el tipo de gasto" });
  }
});

// Actualizar
router.put("/:id", async (req, res) => {
  try {
    const actualizado = await TipoGastos.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ ok: true, tipo: actualizado });
  } catch (error) {
    res.status(400).json({ ok: false, error: "No se pudo actualizar" });
  }
});

// Eliminar
router.delete("/:id", async (req, res) => {
  try {
    await TipoGastos.findByIdAndDelete(req.params.id);
    res.json({ ok: true, mensaje: "Tipo de gasto eliminado" });
  } catch (error) {
    res.status(400).json({ ok: false, error: "No se pudo eliminar" });
  }
});

export default router;
