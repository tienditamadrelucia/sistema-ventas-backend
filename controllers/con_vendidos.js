import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";


// =====================================================
// CREAR PRODUCTO VENDIDO
// =====================================================
export const crearVendido = async (req, res) => {
  console.log(
    "📦 DATA RECIBIDA EN /api/vendidos:",
    req.body
  );

  try {
    const {
      factura,
      productoId,
      cantidad,
      precio,
      dscto = 0,
      total,
      sede = "TIENDITA"
    } = req.body;

    // ---------------------------------------------
    // 1. VALIDAR SEDE
    // ---------------------------------------------
    if (
      sede !== "TIENDITA" &&
      sede !== "MONASTERIO"
    ) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    // ---------------------------------------------
    // 2. BUSCAR EL PRODUCTO
    // ---------------------------------------------
    const producto = await Producto.findById(
      productoId
    );

    if (!producto) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado"
      });
    }

    // ---------------------------------------------
    // 3. ACTIVIDAD PRODUCTIVA
    // Se congela la actividad que tiene el producto
    // al momento de realizar la venta.
    // ---------------------------------------------
    const actividadProductiva =
      producto.actividadProductiva || null;

    // ---------------------------------------------
    // 4. REGLA DE PARTICIPACIÓN
    // ---------------------------------------------
    const generaParticipacion =
      Boolean(producto.generaParticipacion);

    let beneficiarioParticipacion = "NINGUNO";
    let tipoParticipacion = "NINGUNA";
    let valorParticipacion = 0;
    let montoParticipacion = 0;

    if (generaParticipacion) {
      beneficiarioParticipacion =
        producto.beneficiarioParticipacion ||
        "NINGUNO";

      tipoParticipacion =
        producto.tipoParticipacion ||
        "NINGUNA";

      valorParticipacion =
        Number(
          producto.valorParticipacion || 0
        );

      // -------------------------------------------
      // 5. CALCULAR PARTICIPACIÓN
      // -------------------------------------------
      if (
        tipoParticipacion === "PORCENTAJE"
      ) {
        montoParticipacion =
          Number(total || 0) *
          valorParticipacion /
          100;
      }

      if (
        tipoParticipacion === "MONTO_FIJO"
      ) {
        montoParticipacion =
          Number(cantidad || 0) *
          valorParticipacion;
      }
    }

    // Redondear a 2 decimales
    montoParticipacion =
      Math.round(
        (montoParticipacion +
          Number.EPSILON) *
          100
      ) / 100;

    // ---------------------------------------------
    // 6. GUARDAR VENDIDO
    // ---------------------------------------------
    const vendido = new Vendidos({
      factura,
      productoId,
      cantidad,
      precio,
      dscto,
      total,
      sede,

      actividadProductiva,

      generaParticipacion,

      beneficiarioParticipacion,

      tipoParticipacion,

      valorParticipacion,

      montoParticipacion
    });

    await vendido.save();

    // ---------------------------------------------
    // 7. RESPUESTA
    // ---------------------------------------------
    return res.json({
      ok: true,
      vendido
    });

  } catch (error) {
    console.error(
      "Error guardando producto vendido:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Error al guardar producto vendido"
    });
  }
};


// =====================================================
// OBTENER PRODUCTOS VENDIDOS POR FACTURA
// =====================================================
export const obtenerVendidosPorVenta = async (
  req,
  res
) => {
  try {
    const { factura } = req.params;

    const sede =
      req.query.sede || "TIENDITA";

    if (
      sede !== "TIENDITA" &&
      sede !== "MONASTERIO"
    ) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const vendido = await Vendidos
      .find({
        factura,
        sede
      })
      .populate("productoId")
      .populate(
        "actividadProductiva",
        "descripcion activa"
      );

    res.json(vendido);

  } catch (error) {
    console.error(
      "Error al obtener vendidos:",
      error
    );

    res.status(500).json({
      error:
        "Backend dice: Error al obtener vendidos"
    });
  }
};
