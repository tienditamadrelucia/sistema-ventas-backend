import express from "express";
import Producto from "../models/Producto.js";

const router = express.Router();

// Obtener todos los productos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error obteniendo productos" });
  }
});

// Obtener el próximo código disponible
router.get("/proximo-codigo", async (req, res) => {

  console.log("🔥🔥🔥 ENTRÓ A LA RUTA /proximo-codigo 🔥🔥🔥");
  try {
    const ultimo = await Producto.findOne().sort({ codigo: -1 });
    const proximo = ultimo ? Number(ultimo.codigo) + 1 : 1;
    res.json({ codigo: proximo, test: "VERSION-NUEVA" });
  } catch (error) {
    console.error("Error obteniendo próximo código:", error);
    res.status(500).json({ codigo: null, error: "Error obteniendo próximo código" });
  }
});


// Obtener productos por categoría (solo UNA ruta)
router.get("/por-categoria/:codigo", async (req, res) => {
  try {
    const productos = await Producto.find({ categoria: req.params.codigo });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error obteniendo productos por categoría" });
  }
});

// Crear producto
router.post("/", async (req, res) => {
  try {
    const ultimo = await Producto.findOne().sort({ codigo: -1 });
    const nuevoCodigo = ultimo ? Number(ultimo.codigo) + 1 : 1;

    const nuevo = new Producto({
      ...req.body,
      codigo: nuevoCodigo
    });

    await nuevo.save();
    res.json({ ok: true, producto: nuevo });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error creando producto" });
  }
});

// Actualizar producto
router.put("/:id", async (req, res) => {
  try {
    const actualizado = await Producto.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ ok: true, producto: actualizado });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error actualizando producto" });
  }
});

// Obtener producto por ID (DEBE IR AL FINAL)
router.get("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error obteniendo producto" });
  }
});

// Eliminar producto
router.delete("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    await Producto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error eliminando producto" });
  }
});

export default router;
