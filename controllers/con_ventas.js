import ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Contador from "../models/Contador.js";

// Los registros antiguos sin sede pertenecen a TIENDITA.
const filtroPorSede = sede =>
  sede === "MONASTERIO"
    ? { sede: "MONASTERIO" }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

const obtenerTipoContador = sede =>
  sede === "MONASTERIO"
    ? "FACTURA_MONASTERIO"
    : "FACTURA_TIENDITA";

// CONSULTAR NÚMERO ACTUAL SIN INCREMENTAR
export async function FacturaNro(sede = "TIENDITA") {
  const tipo = obtenerTipoContador(sede);

  const documento = await Contador.findOne({ tipo });

  return documento ? documento.valor : 0;
}

// ASIGNAR NÚMERO: COMPATIBILIDAD CON IMPORTACIONES EXISTENTES
export async function asignarFactura(sede = "TIENDITA") {
  const tipo = obtenerTipoContador(sede);

  const documento = await Contador.findOneAndUpdate(
    { tipo },
    {
      $inc: { valor: 1 }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return documento.valor;
}

// CREAR MOVIMIENTO
// Las ventas normales utilizarán /operacion-completa.
// Esta función conserva el flujo de otros ingresos.
export const crearVenta = async (req, res) => {
  try {
    const sede = req.body.sede || "TIENDITA";

    const tipoMovimiento =
      req.body.tipoMovimiento || "VENTA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    if (
      !["VENTA", "OTRO_INGRESO"].includes(tipoMovimiento)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Tipo de movimiento inválido"
      });
    }

    const datos = {
      ...req.body,
      sede,
      tipoMovimiento
    };

    if (tipoMovimiento === "OTRO_INGRESO") {
      const esParticipacionTiendita =
        sede === "TIENDITA" &&
        req.body.origenIngreso === "PARTICIPACION";

      if (!esParticipacionTiendita) {
        datos.factura = null;
      }
    }

    const movimiento = new ventas(datos);

    // Compartir la transacción creada por el middleware.
    const guardada = await movimiento.save({
      session: req.cajaMongo
    });

    const usaFactura =
      tipoMovimiento === "VENTA" ||
      (
        tipoMovimiento === "OTRO_INGRESO" &&
        sede === "TIENDITA" &&
        req.body.origenIngreso === "PARTICIPACION" &&
        guardada.factura !== null
      );

    if (usaFactura) {
      await Contador.findOneAndUpdate(
        {
          tipo: obtenerTipoContador(sede)
        },
        {
          $inc: { valor: 1 }
        },
        {
          upsert: true,
          setDefaultsOnInsert: true
        }
      ).session(req.cajaMongo);
    }

    return res.json({
      ok: true,
      idVenta: guardada._id,
      factura: guardada.factura ?? null,
      numeroReciboIngreso:
        guardada.numeroReciboIngreso || "",
      tipoMovimiento,
      sede
    });
  } catch (error) {
    console.error("Error creando movimiento:", error);

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error al guardar el movimiento"
    });
  }
};

// OBTENER VENTAS POR SEDE
export const obtenerVentas = async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";

    const lista = await ventas
      .find(filtroPorSede(sede))
      .sort({ createdAt: -1 });

    return res.json(lista);
  } catch (error) {
    console.error("Error al obtener ventas:", error);

    return res.status(500).json({
      error: "Error al obtener ventas"
    });
  }
};

// BUSCAR VENTA POR FACTURA Y SEDE
export const buscarVentaPorNumero = async (req, res) => {
  try {
    const numero = Number(req.params.numeroFactura);
    const sede = req.query.sede || "TIENDITA";
    const filtroSede = filtroPorSede(sede);

    const venta = await ventas.findOne({
      factura: numero,
      ...filtroSede
    });

    if (!venta) {
      return res.json({
        ok: false,
        mensaje: "Factura no encontrada"
      });
    }

    const vendidos = await Vendidos.find({
      factura: numero,
      ...filtroSede
    }).populate("productoId");

    return res.json({
      ok: true,
      venta,
      vendidos
    });
  } catch (error) {
    console.error("Error consultando factura:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "Error interno"
    });
  }
};