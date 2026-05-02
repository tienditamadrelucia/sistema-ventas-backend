import express from "express";
import Categoria from "../models/Categoria.js";

const router = express.Router();
// Obtener todas
router.get("/", async (req, res) => {
    const categorias = await Categoria.find().sort({ descripcion: 1 }); // ⭐ orden alfabético
    res.json(categorias);
});

// Crear
router.post("/", async (req, res) => {
  try {
    const { codigo, descripcion } = req.body;

    // Validar código duplicado
    const existe = await Categoria.findOne({ codigo: codigo.toUpperCase() });
    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe una categoría con ese código"
      });
    }

    const nueva = new Categoria({
      codigo: codigo.toUpperCase(),
      descripcion
    });

    const guardada = await nueva.save();
    const completa = await Categoria.findById(guardada._id);

    res.json(completa);

  } catch (error) {
    console.log("Error creando categoría:", error);
    res.status(500).json({ ok: false, error: "Error creando categoría" });
  }
});


// Actualizar
router.put("/:id", async (req, res) => {
  try {
    const { codigo, descripcion } = req.body;

    // Validar duplicado en otras categorías
    const existe = await Categoria.findOne({
      codigo: codigo.toUpperCase(),
      _id: { $ne: req.params.id }  // excluir la misma categoría
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe otra categoría con ese código"
      });
    }

    const actualizada = await Categoria.findByIdAndUpdate(
      req.params.id,
      { codigo: codigo.toUpperCase(), descripcion },
      { new: true }
    );

    res.json(actualizada);

  } catch (error) {
    console.log("Error actualizando categoría:", error);
    res.status(500).json({ ok: false, error: "Error actualizando categoría" });
  }
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
      console.log("Productos asociados:", productos);
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar la categoría porque tiene productos asociados"
      });
    }
    // Si no tiene productos → eliminar
    await Categoria.findByIdAndDelete(id);
    res.json({ ok: true, mensaje: "Categoría eliminada" });
  } catch (error) {
  console.error("Error eliminando categoría:", error.message);
  res.status(500).json({ ok: false, error: "Error eliminando categoría" });
}
});


export default router;