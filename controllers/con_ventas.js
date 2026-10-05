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
// CREAR VENTA / OTRO INGRESO
// =====================================================
export const crearVenta = async (req, res) => {
  try {
    const sede = req.body.sede || "TIENDITA";

    const tipoMovimiento =
      req.body.tipoMovimiento || "VENTA";

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
    // 2. VALIDAR TIPO DE MOVIMIENTO
    // ---------------------------------------------
    if (
      tipoMovimiento !== "VENTA" &&
      tipoMovimiento !== "OTRO_INGRESO"
    ) {
      return res.status(400).json({
        ok: false,
        error: "Tipo de movimiento inválido"
      });
    }

    // ---------------------------------------------
    // 3. PREPARAR DATOS
    // ---------------------------------------------
    const datos = {
      ...req.body,
      sede,
      tipoMovimiento
    };

    // OTRO INGRESO no utiliza factura
    if (tipoMovimiento === "OTRO_INGRESO") {
      datos.factura = null;
    }

    // ---------------------------------------------
    // 4. GUARDAR
    // ---------------------------------------------
    const venta = new ventas(datos);

    const guardada = await venta.save();

    // ---------------------------------------------
    // 5. INCREMENTAR CONTADOR
    // SOLO SI ES UNA VENTA REAL
    // ---------------------------------------------
    if (tipoMovimiento === "VENTA") {

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
    }

    // ---------------------------------------------
    // 6. RESPONDER AL FRONTEND
    // ---------------------------------------------
    return res.json({
      ok: true,
      idVenta: guardada._id,

      factura:
        tipoMovimiento === "VENTA"
          ? guardada.factura
          : null,

      numeroReciboIngreso:
        guardada.numeroReciboIngreso || "",

      tipoMovimiento,
      sede
    });

  } catch (error) {
    console.error(
      "Error creando movimiento:",
      error
    );

    console.error(
      "🔴 ERROR EXACTO:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error al guardar el movimiento"
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