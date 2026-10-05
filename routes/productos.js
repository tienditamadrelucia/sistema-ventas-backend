import express from "express";
import Producto from "../models/Producto.js";
import vendidos from "../models/dbVendidos.js";
import Entrada from "../models/Entrada.js";
import dbSalidas from "../models/dbSalidas.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import upload from "../config/cloudinary.js";


const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  // Los productos antiguos no tienen el campo sede.
  // Esos pertenecen a la TIENDITA.
  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};

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
}

//fotos de productos
router.post("/upload", upload.single("foto"), async (req, res) => {
  res.json({ url: req.file.path });
});

// Obtener todos los productos
router.get("/", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";
    let productos = await Producto.find(
      filtroPorSede(sede)
    )
    .populate("actividadProductiva", "descripcion activa")    
    .sort({ categoria: 1, codigo: 1 });
    productos = productos.map(p => {
      p = p.toObject();
      if (!p.foto) return p;
      // LIMPIAR ESPACIOS
      p.foto = p.foto.trim();
      // FORZAR HTTPS SI LA URL EMPIEZA CON HTTP
      if (p.foto.startsWith("http://")) {
        p.foto = p.foto.replace("http://", "https://");
      }
      // SI NO ES URL COMPLETA, CONSTRUIRLA
      if (!p.foto.startsWith("https://")) {
        p.foto = `https://sistema-ventas-backend-qxbi.onrender.com/${p.foto.replace(/^\//, "")}`;
      }
      return p;
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error obteniendo productos" });
  }
});

// Obtener el próximo código disponible
router.get("/proximo-codigo", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";
    const ultimo = await Producto.findOne(
      filtroPorSede(sede)
    ).sort({ codigo: -1 });
    const proximo = ultimo ? Number(ultimo.codigo) + 1 : 1;
    res.json({
      codigo: proximo,
      sede: sede,
      test: "VERSION-SEDE"
    });
  } catch (error) {
    console.error("Error obteniendo próximo código:", error);
    res.status(500).json({
      codigo: null,
      error: "Error obteniendo próximo código"
    });
  }
});

// Obtener productos por categoría (solo UNA ruta)
router.get("/por-categoria/:codigo", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";

    const productos = await Producto.find({
      categoria: req.params.codigo,
      ...filtroPorSede(sede)
    })
    .populate("actividadProductiva", "descripcion activa")
    .sort({ codigo: 1 });

    res.json(productos);

  } catch (error) {
    console.error("Error obteniendo productos por categoría:", error);

    res.status(500).json({
      ok: false,
      error: "Error obteniendo productos por categoría"
    });
  }
});

// ==========================================
// CREAR PRODUCTO
// ==========================================

router.post("/", async (req, res) => {
  try {
    const sede =
      req.body.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    const origen =
      req.body.origen === "PRODUCCION_MONASTERIO"
        ? "PRODUCCION_MONASTERIO"
        : "COMPRADO";

    let generaParticipacion = false;
    let beneficiarioParticipacion = "NINGUNO";
    let tipoParticipacion = "NINGUNA";
    let valorParticipacion = 0;

    let costo = Number(req.body.costo || 0);

    // --------------------------------------
    // PRODUCTO COMPRADO
    // --------------------------------------

    if (origen === "COMPRADO") {
      generaParticipacion = false;
      beneficiarioParticipacion = "NINGUNO";
      tipoParticipacion = "NINGUNA";
      valorParticipacion = 0;

      if (!Number.isFinite(costo) || costo < 0) {
        return res.status(400).json({
          ok: false,
          error: "El precio de costo no puede ser negativo."
        });
      }
    }

    // --------------------------------------
    // PRODUCCIÓN DEL MONASTERIO
    // --------------------------------------

    if (origen === "PRODUCCION_MONASTERIO") {
      // El producto terminado no tiene costo
      // de adquisición en esta sede.
      // Sus costos reales se controlarán
      // posteriormente por actividad/producto.
      costo = 0;

      generaParticipacion =
        req.body.generaParticipacion === true;

      if (generaParticipacion) {
        // El beneficiario siempre es la OTRA sede.
        beneficiarioParticipacion =
          sede === "TIENDITA"
            ? "MONASTERIO"
            : "TIENDITA";

        if (
          !["PORCENTAJE", "MONTO_FIJO"].includes(
            req.body.tipoParticipacion
          )
        ) {
          return res.status(400).json({
            ok: false,
            error:
              `Debe seleccionar la forma de participación para ${
                beneficiarioParticipacion === "MONASTERIO"
                  ? "el Monasterio"
                  : "la Tiendita"
              }.`
          });
        }

        tipoParticipacion = req.body.tipoParticipacion;

        valorParticipacion = Number(
          req.body.valorParticipacion || 0
        );

        if (
          !Number.isFinite(valorParticipacion) ||
          valorParticipacion <= 0
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "El valor de la participación debe ser mayor que cero."
          });
        }

        if (
          tipoParticipacion === "PORCENTAJE" &&
          valorParticipacion > 100
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "El porcentaje de participación no puede ser mayor de 100%."
          });
        }
      }
    }

    // --------------------------------------
    // PRÓXIMO CÓDIGO POR SEDE
    // --------------------------------------

    const ultimo = await Producto.findOne(
      filtroPorSede(sede)
    ).sort({ codigo: -1 });

    const nuevoCodigo = ultimo
      ? Number(ultimo.codigo) + 1
      : 1;

    // --------------------------------------
    // CREAR PRODUCTO
    // --------------------------------------

    const nuevo = new Producto({
      ...req.body,

      codigo: nuevoCodigo,
      sede,
      costo,
      origen,

      generaParticipacion,
      beneficiarioParticipacion,
      tipoParticipacion,
      valorParticipacion
    });

    await nuevo.save();

    await ordenarProductosDB();

    return res.json({
      ok: true,
      producto: nuevo
    });

  } catch (error) {
    console.error("Error creando producto:", error);

    return res.status(500).json({
      ok: false,
      error: "Error creando producto"
    });
  }
});

// ==========================================
// AJUSTAR PRECIOS AUTOMÁTICAMENTE
// ==========================================
router.put("/ajustar-precios", async (req, res) => {
  try {
    const { tasaAnterior, tasaActual, sede } = req.body;

    // --------------------------------------
    // VALIDACIONES
    // --------------------------------------
    if (!tasaAnterior || !tasaActual || !sede) {
      return res.status(400).json({
        ok: false,
        msg: "Tasa anterior, tasa actual y sede son obligatorias."
      });
    }

    const anterior = Number(tasaAnterior);
    const actual = Number(tasaActual);

    if (
      !Number.isFinite(anterior) ||
      !Number.isFinite(actual) ||
      anterior <= 0 ||
      actual <= 0
    ) {
      return res.status(400).json({
        ok: false,
        msg: "Las tasas deben ser números mayores que cero."
      });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida."
      });
    }

    // --------------------------------------
    // FILTRO POR SEDE
    // --------------------------------------
    // Los productos antiguos sin sede
    // pertenecen a TIENDITA.
    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    // --------------------------------------
    // BUSCAR PRODUCTOS DE ESTA SEDE
    // --------------------------------------
    const productos = await Producto.find({
      ...filtroSede
    });

    if (productos.length === 0) {
      return res.status(404).json({
        ok: false,
        msg: `No hay productos registrados en ${sede}.`
      });
    }

    let modificados = 0;

    // --------------------------------------
    // AJUSTAR CADA PRODUCTO
    // --------------------------------------
    for (const producto of productos) {
      const precioActual = Number(producto.venta);

      if (
        !Number.isFinite(precioActual) ||
        precioActual <= 0
      ) {
        continue;
      }

      // Guardamos el precio que tenía antes
      producto.precioanterior = precioActual;

      // Fórmula:
      // precio nuevo =
      // precio actual / tasa anterior * tasa actual
      const nuevoPrecio =
        (precioActual / anterior) * actual;

      // Redondear a 2 decimales
      producto.venta =
        Math.round(nuevoPrecio * 100) / 100;

      // Si es un registro antiguo de Tiendita
      // aprovechamos para identificar su sede.
      if (!producto.sede && sede === "TIENDITA") {
        producto.sede = "TIENDITA";
      }

      await producto.save();

      modificados++;
    }

    return res.json({
      ok: true,
      msg:
        `Ajuste realizado correctamente en ${sede}.\n` +
        `Productos actualizados: ${modificados}.`,
      modificados
    });

  } catch (error) {
    console.error(
      "Error ajustando precios automáticamente:",
      error
    );

    return res.status(500).json({
      ok: false,
      msg: "Error ajustando los precios.",
      error: error.message
    });
  }
});

// ==========================================
// ACTUALIZAR PRODUCTO
// ==========================================

router.put("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id)
      .populate("actividadProductiva", "descripcion activa");

    if (!producto) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado"
      });
    }

    // Conservamos la sede original del producto.
    const sede =
      producto.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

    const origen =
      req.body.origen === "PRODUCCION_MONASTERIO"
        ? "PRODUCCION_MONASTERIO"
        : "COMPRADO";

    let generaParticipacion = false;
    let beneficiarioParticipacion = "NINGUNO";
    let tipoParticipacion = "NINGUNA";
    let valorParticipacion = 0;

    let costo = Number(req.body.costo || 0);

    // --------------------------------------
    // PRODUCTO COMPRADO
    // --------------------------------------

    if (origen === "COMPRADO") {
      generaParticipacion = false;
      beneficiarioParticipacion = "NINGUNO";
      tipoParticipacion = "NINGUNA";
      valorParticipacion = 0;

      if (!Number.isFinite(costo) || costo < 0) {
        return res.status(400).json({
          ok: false,
          error: "El precio de costo no puede ser negativo."
        });
      }
    }

    // --------------------------------------
    // PRODUCCIÓN DEL MONASTERIO
    // --------------------------------------

    if (origen === "PRODUCCION_MONASTERIO") {
      costo = 0;

      generaParticipacion =
        req.body.generaParticipacion === true;

      if (generaParticipacion) {
        // El beneficiario siempre es la OTRA sede.
        beneficiarioParticipacion =
          sede === "TIENDITA"
            ? "MONASTERIO"
            : "TIENDITA";

        if (
          !["PORCENTAJE", "MONTO_FIJO"].includes(
            req.body.tipoParticipacion
          )
        ) {
          return res.status(400).json({
            ok: false,
            error:
              `Debe seleccionar la forma de participación para ${
                beneficiarioParticipacion === "MONASTERIO"
                  ? "el Monasterio"
                  : "la Tiendita"
              }.`
          });
        }

        tipoParticipacion = req.body.tipoParticipacion;

        valorParticipacion = Number(
          req.body.valorParticipacion || 0
        );

        if (
          !Number.isFinite(valorParticipacion) ||
          valorParticipacion <= 0
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "El valor de la participación debe ser mayor que cero."
          });
        }

        if (
          tipoParticipacion === "PORCENTAJE" &&
          valorParticipacion > 100
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "El porcentaje de participación no puede ser mayor de 100%."
          });
        }
      }
    }

    const actualizado = await Producto.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,

        // No permitimos cambiar accidentalmente
        // código ni sede.
        codigo: producto.codigo,
        sede: producto.sede,

        costo,
        origen,

        generaParticipacion,
        beneficiarioParticipacion,
        tipoParticipacion,
        valorParticipacion
      },
      {
        new: true,
        runValidators: true
      }
    );

    return res.json({
      ok: true,
      producto: actualizado
    });

  } catch (error) {
    console.error("Error actualizando producto:", error);

    return res.status(500).json({
      ok: false,
      error: "Error actualizando producto"
    });
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
  console.log("➡️ Eliminando producto ID:", req.params.id);
  console.log("Venta:", vendidos);
  console.log("Entrada:", Entrada);
  console.log("Salida:", dbSalidas);
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
    const ventas = await vendidos.find({ productoId: id });
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
    const salidas = await dbSalidas.find({ productoId: id });
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
