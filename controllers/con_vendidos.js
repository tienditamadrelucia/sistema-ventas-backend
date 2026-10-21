import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";

// =====================================================
// CREAR PRODUCTO VENDIDO
// =====================================================
export const crearVendido = async (req, res) => {
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

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const producto = await Producto.findById(
      productoId
    ).session(req.cajaMongo);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        error: "Producto no encontrado"
      });
    }

    // Conservar la actividad que tiene el producto
    // al momento de registrar la venta.
    const actividadProductiva =
      producto.actividadProductiva || null;

    const generaParticipacion =
      Boolean(producto.generaParticipacion);

    let beneficiarioParticipacion = "NINGUNO";
    let tipoParticipacion = "NINGUNA";
    let valorParticipacion = 0;
    let montoParticipacion = 0;

    if (generaParticipacion) {
      beneficiarioParticipacion =
        producto.beneficiarioParticipacion || "NINGUNO";

      tipoParticipacion =
        producto.tipoParticipacion || "NINGUNA";

      valorParticipacion = Number(
        producto.valorParticipacion || 0
      );

      if (tipoParticipacion === "PORCENTAJE") {
        montoParticipacion =
          Number(total || 0) *
          valorParticipacion /
          100;
      }

      if (tipoParticipacion === "MONTO_FIJO") {
        montoParticipacion =
          Number(cantidad || 0) *
          valorParticipacion;
      }
    }

    montoParticipacion = Math.round(
      (montoParticipacion + Number.EPSILON) * 100
    ) / 100;

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

    // Compartir la transacción creada por el middleware.
    await vendido.save({
      session: req.cajaMongo
    });

    return res.json({
      ok: true,
      vendido
    });
  } catch (error) {
    const conflicto =
      error.code === 112 ||
      error.hasErrorLabel?.("TransientTransactionError");

    return res.status(conflicto ? 409 : 500).json({
      ok: false,
      error:
        "No se pudo guardar el producto vendido; " +
        "actualice y vuelva a intentarlo"
    });
  }
};

// =====================================================
// OBTENER PRODUCTOS VENDIDOS POR FACTURA Y SEDE
// =====================================================
export const obtenerVendidosPorVenta = async (req, res) => {
  try {
    const { factura } = req.params;
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = sede === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    const vendidos = await Vendidos.find({
      factura,
      ...filtroSede
    })
      .populate("productoId")
      .populate(
        "actividadProductiva",
        "descripcion activa"
      );

    return res.json(vendidos);
  } catch {
    return res.status(500).json({
      ok: false,
      error: "Error al obtener productos vendidos"
    });
  }
};