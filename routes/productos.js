import express from "express";
import Producto from "../models/Producto.js";

const router = express.Router();

// Obtener todos los productos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find();
    res.json(productos);
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo productos" });
  }
});

// Crear producto con código autoincremental
router.post("/", async (req, res) => {
  try {
    // 1. Buscar el último producto por código (numérico)
    const ultimo = await Producto.findOne().sort({ codigo: -1 });
    // 2. Calcular el nuevo código
    const nuevoCodigo = ultimo ? Number(ultimo.codigo) + 1 : 1;
    // 3. Crear el producto con el nuevo código
    const nuevo = new Producto({
      ...req.body,
      codigo: nuevoCodigo
    });
    await nuevo.save();
    res.json({ ok: true, producto: nuevo });
  } catch (error) {
    console.error("Error creando producto:", error);
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
    console.error("Error actualizando producto:", error);
    res.status(500).json({ ok: false, error: "Error actualizando producto" });
  }
});

// Eliminar producto
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Buscar el producto
    const producto = await Producto.findById(id);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    const codigo = producto.codigo;

    // Verificar rol del usuario (asumiendo req.user.rol)
    const esAdmin = req.user?.rol === "admin";

    // Si NO es admin → verificar movimientos
    if (!esAdmin) {
      const tieneVentas = await Venta.findOne({ "items.codigo": codigo });
      const tieneEntradas = await Entrada.findOne({ codigo });
      const tieneSalidas = await Salida.findOne({ codigo });
      const tieneCreditos = await Credito.findOne({ "items.codigo": codigo });

      if (tieneVentas || tieneEntradas || tieneSalidas || tieneCreditos) {
        return res.status(400).json({
          ok: false,
          error: "No se puede eliminar este producto porque tiene movimientos asociados."
        });
      }
    }

    // Si es admin o no tiene movimientos → eliminar
    await Producto.findByIdAndDelete(id);

    res.json({ ok: true });

  } catch (error) {
    console.error("Error eliminando producto:", error);
    res.status(500).json({ ok: false, error: "Error eliminando producto" });
  }
});

// Obtener producto por ID
router.get("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) {
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }
    res.json(producto);
  } catch (error) {
    console.error("Error obteniendo producto:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo producto" });
  }
});

// Obtener productos por categoría
router.get("/por-categoria/:idCategoria", async (req, res) => {
  try {
    const productos = await Producto.find({ categoriaId: req.params.idCategoria });
    res.json(productos);
  } catch (error) {
    console.error("Error obteniendo productos por categoría:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo productos por categoría" });
  }
});

// Obtener el próximo código disponible
router.get("/proximo-codigo", async (req, res) => {
  //alert("codigo nuevo")
  try {
    const ultimo = await Producto.findOne().sort({ codigo: -1 });
      
//alert("codigo nuevo" + codigo)
    const proximo = ultimo ? ultimo.codigo + 1 : 1;

    res.json({ codigo: proximo });
  } catch (error) {
    console.error("Error obteniendo próximo código:", error);
    res.status(500).json({ error: "Error obteniendo próximo código" });
  }
});

//productos por categoria
router.get("/por-categoria/:codigo", async (req, res) => {
  try {
    const productos = await Producto.find({ categoria: req.params.codigo });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error obteniendo productos por categoría" });
  }
});



export default router;