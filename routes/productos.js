import express from "express";
import Producto from "../models/Producto.js";

const router = express.Router();

// ⭐ FUNCIÓN PARA ORDENAR TODA LA DB COMO TÚ QUIERES
async function ordenarProductosDB() {
  const productos = await Producto.find();

  // ⭐ ORDENAR PRIMERO POR CATEGORÍA, LUEGO POR CÓDIGO
  productos.sort((a, b) => {
    // 1. Ordenar por categoría
    if (a.categoria < b.categoria) return -1;
    if (a.categoria > b.categoria) return 1;

    // 2. Si la categoría es igual, ordenar por código numérico
    const codA = Number(a.codigo);
    const codB = Number(b.codigo);
    return codA - codB;
  });

  // Guardar el orden en un campo "orden"
  for (let i = 0; i < productos.length; i++) {
    await Producto.findByIdAndUpdate(productos[i]._id, { orden: i });
  }

  console.log("🔥 Productos ordenados por CATEGORÍA y luego por CÓDIGO");
}



// Obtener todos los productos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find().sort({ 
      categoria: 1,
      codigo: 1
    });
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

    // ⭐ ORDENAR TODA LA DB DESPUÉS DE CREAR UN PRODUCTO
    await ordenarProductosDB();

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
    console.log("➡️ Eliminando producto ID:", req.params.id);

    const { id } = req.params;

    // 1. Verificar que el producto exista
    const producto = await Producto.findById(id);
    console.log("📌 Producto encontrado:", producto);

    if (!producto) {
      console.log("❌ Producto NO encontrado");
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    }

    // 2. Validar ventas asociadas
    const ventas = await Venta.find({ productoId: id });
    console.log("📌 Ventas asociadas:", ventas.length);

    if (ventas.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar el producto porque tiene ventas asociadas"
      });
    }

    // 3. Validar entradas asociadas
    const entradas = await Entrada.find({ productoId: id });
    console.log("📌 Entradas asociadas:", entradas.length);

    if (entradas.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar el producto porque tiene entradas asociadas"
      });
    }

    // 4. Validar salidas asociadas
    const salidas = await Salida.find({ productoId: id });
    console.log("📌 Salidas asociadas:", salidas.length);

    if (salidas.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar el producto porque tiene salidas asociadas"
      });
    }

    // 5. Si no tiene relaciones → eliminar
    await Producto.findByIdAndDelete(id);
    console.log("✅ Producto eliminado correctamente");

    return res.json({ ok: true });

  } catch (error) {
    console.error("🔥 ERROR REAL ELIMINANDO PRODUCTO:", error);
    return res.status(500).json({ ok: false, error: "Error eliminando producto" });
  }
});





export default router;
