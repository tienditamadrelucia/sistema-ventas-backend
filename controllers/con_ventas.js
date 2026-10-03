import ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Contador from "../models/Contador.js";


// =====================================================
// FILTRO POR SEDE
// Los registros antiguos sin sede pertenecen a TIENDITA
// =====================================================
const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return {
      sede: "MONASTERIO"
    };
  }

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};


// =====================================================
// OBTENER NOMBRE DEL CONTADOR SEGÚN LA SEDE
// =====================================================
const obtenerTipoContador = (sede) => {
  return sede === "MONASTERIO"
    ? "FACTURA_MONASTERIO"
    : "FACTURA_TIENDITA";
};


// =====================================================
// OBTENER NÚMERO ACTUAL
// NO INCREMENTA
// =====================================================
export async function FacturaNro(
  sede = "TIENDITA"
) {
  const tipo = obtenerTipoContador(sede);

  const doc = await Contador.findOne({
    tipo
  });

  if (!doc) {
    return 0;
  }

  return doc.valor;
}


// =====================================================
// ASIGNAR NUEVO NÚMERO
// SÍ INCREMENTA
// =====================================================
export async function asignarFactura(
  sede = "TIENDITA"
) {
  const tipo = obtenerTipoContador(sede);

  const doc = await Contador.findOneAndUpdate(
    {
      tipo
    },
    {
      $inc: {
        valor: 1
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return doc.valor;
}


// =====================================================
// CREAR VENTA
// =====================================================
export const crearVenta = async (req, res) => {
  try {
    const sede = req.body.sede || "TIENDITA";

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
    // 1. Guardar la venta
    // ---------------------------------------------
    const venta = new ventas({
      ...req.body,
      sede
    });

    const guardada = await venta.save();

    // ---------------------------------------------
    // 2. Incrementar contador DE ESTA SEDE
    // ---------------------------------------------
    const tipoContador =
      obtenerTipoContador(sede);

    await Contador.findOneAndUpdate(
      {
        tipo: tipoContador
      },
      {
        $inc: {
          valor: 1
        }
      },
      {
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    // ---------------------------------------------
    // 3. Responder al frontend
    // ---------------------------------------------
    return res.json({
      ok: true,
      idVenta: guardada._id,
      factura: guardada.factura,
      sede
    });

  } catch (error) {
    console.error(
      "Error creando venta:",
      error
    );

    console.error(
      "🔴 ERROR EXACTO EN CREAR VENTA:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      error: "Error al guardar la venta"
    });
  }
};


// =====================================================
// OBTENER VENTAS POR SEDE
// =====================================================
export const obtenerVentas = async (
  req,
  res
) => {
  try {
    const sede =
      req.query.sede || "TIENDITA";

    const filtroSede =
      filtroPorSede(sede);

    const lista = await ventas
      .find(filtroSede)
      .sort({
        createdAt: -1
      });

    return res.json(lista);

  } catch (error) {
    console.error(
      "Error al obtener ventas:",
      error
    );

    return res.status(500).json({
      error: "Error al obtener ventas"
    });
  }
};


// =====================================================
// BUSCAR VENTA POR NÚMERO DE FACTURA Y SEDE
// =====================================================
export const buscarVentaPorNumero = async (
  req,
  res
) => {
  try {
    const numero = Number(
      req.params.numeroFactura
    );

    const sede =
      req.query.sede || "TIENDITA";

    const filtroSede =
      filtroPorSede(sede);

    // ---------------------------------------------
    // 1. Buscar venta
    // ---------------------------------------------
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

    // ---------------------------------------------
    // 2. Buscar productos vendidos
    // ---------------------------------------------
    const vendidos = await Vendidos.find({
      factura: numero,
      ...filtroSede
    }).populate("productoId");

    // ---------------------------------------------
    // 3. Respuesta
    // ---------------------------------------------
    return res.json({
      ok: true,
      venta,
      vendidos
    });

  } catch (error) {
    console.error(
      "Backend dice: Error consultando factura:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje: "Error interno"
    });
  }
};