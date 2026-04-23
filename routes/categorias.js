import express from "express";
import Categoria from "../models/Categoria.js";

const router = express.Router();
// Obtener todas
router.get("/", async (req, res) => {
    const categorias = await Categoria.find();
    res.json(categorias);
});
// Crear
router.post("/", async (req, res) => {
    const nueva = new Categoria(req.body);
    const guardada = await nueva.save();
    const completa = await Categoria.findById(guardada._id);
    res.json(completa);
});

// Actualizar
router.put("/:id", async (req, res) => {
    const actualizada = await Categoria.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
    );
    res.json(actualizada);
});

// Eliminar
router.delete("/:id", async (req, res) => {
    await Categoria.findByIdAndDelete(req.params.id);
    res.json({ mensaje: "Categoría eliminada" });
});

export default router;