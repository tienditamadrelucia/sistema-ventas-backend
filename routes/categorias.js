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

// Eliminar categoría
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar la categoría
    const categoria = await Categoria.findById(id);
    if (!categoria) {
      return res.status(404).json({ ok: false, error: "Categoría no encontrada" });
    }

    // Validar si hay productos asociados a esta categoría
    const productos = await Producto.find({ categoria: id });
    if (productos.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar la categoría porque tiene productos asociados"
      });
    }

    // Si no tiene productos → eliminar
    await Categoria.findByIdAndDelete(id);
    res.json({ ok: true, mensaje: "Categoría eliminada" });
  } catch (error) {
    console.error("Error eliminando categoría:", error);
    res.status(500).json({ ok: false, error: "Error eliminando categoría" });
  }
});


export default router;