import Moneda from "../models/dbMoneda.js";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";


// ======================================================
// FILTRO REUTILIZABLE POR SEDE
// ======================================================
// Los registros antiguos que no tienen campo "sede"
// se consideran pertenecientes a TIENDITA.
const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};


// ======================================================
// VALIDAR SEDE
// ======================================================
const obtenerSede = (req) => {
  return req.query.sede || req.body?.sede || "TIENDITA";
};


// ======================================================
// FUNCIÓN REUTILIZABLE PARA DETECTAR DUPLICADOS
// ======================================================
const detectarDuplicados = (registros) => {
  const mapa = {};
  const duplicados = [];

  for (const r of registros) {
    let fechaISO = "FECHA_INVALIDA";

    try {
      const f = new Date(r.fecha);

      if (!isNaN(f.getTime())) {
        fechaISO = new Date(
          Date.UTC(
            f.getUTCFullYear(),
            f.getUTCMonth(),
            f.getUTCDate(),
            f.getUTCHours(),
            f.getUTCMinutes(),
            f.getUTCSeconds()
          )
        ).toISOString();
      }
    } catch {
      fechaISO = "FECHA_INVALIDA";
    }

    const clave =
      `${r.factura}-${r.operacion}-${r.total}-${fechaISO}`;

    if (!mapa[clave]) {
      mapa[clave] = [r];
    } else {
      mapa[clave].push(r);
    }
  }

  for (const clave in mapa) {
    if (mapa[clave].length > 1) {
      duplicados.push(mapa[clave]);
    }
  }

  return duplicados;
};


// ======================================================
// PAGOS (MONEDA)
// ======================================================
export const detectarDuplicadosMoneda = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const registros = await Moneda.find({
      ...filtroSede
    }).lean();

    const duplicados = detectarDuplicados(registros);

    res.json({
      ok: true,
      sede,
      duplicados
    });

  } catch (error) {
    console.error(
      "Error detectando duplicados de moneda:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};


// ======================================================
// ELIMINAR DUPLICADO DE MONEDA
// ======================================================
export const limpiarDuplicadoMoneda = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const eliminado = await Moneda.findOneAndDelete({
      _id: req.params.id,
      ...filtroSede
    });

    if (!eliminado) {
      return res.status(404).json({
        ok: false,
        error:
          "Registro no encontrado o no pertenece a esta sede"
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {
    console.error(
      "Error eliminando duplicado de moneda:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};


// ======================================================
// VENTAS
// ======================================================
export const detectarDuplicadosVentas = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const registros = await Ventas.find({
      ...filtroSede
    }).lean();

    const duplicados = detectarDuplicados(registros);

    res.json({
      ok: true,
      sede,
      duplicados
    });

  } catch (error) {
    console.error(
      "Error detectando duplicados de ventas:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};


// ======================================================
// ELIMINAR VENTA DUPLICADA
// ======================================================
export const eliminarVentaDuplicada = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const eliminado = await Ventas.findOneAndDelete({
      _id: req.params.id,
      ...filtroSede
    });

    if (!eliminado) {
      return res.status(404).json({
        ok: false,
        error:
          "Registro no encontrado o no pertenece a esta sede"
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {
    console.error(
      "Error eliminando venta duplicada:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};


// ======================================================
// VENDIDOS
// ======================================================
export const detectarDuplicadosVendidos = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const registros = await Vendidos.find({
      ...filtroSede
    })
      .populate(
        "productoId",
        "codigo descripcion"
      )
      .lean();

    const mapa = {};
    const duplicados = [];

    for (const r of registros) {
      let fechaISO = "SIN_FECHA";

      try {
        const f = new Date(r.createdAt);

        if (!isNaN(f.getTime())) {
          fechaISO = f.toISOString();
        } else {
          fechaISO = "FECHA_INVALIDA";
        }
      } catch {
        fechaISO = "FECHA_INVALIDA";
      }

      // Cuando productoId está populateado es un objeto.
      // Tomamos su _id real para formar la clave.
      const productoId =
        r.productoId?._id?.toString() ||
        r.productoId?.toString() ||
        "SIN_PRODUCTO";

      const clave =
        `${r.factura}-${productoId}-${r.total}-${fechaISO}`;

      if (!mapa[clave]) {
        mapa[clave] = [r];
      } else {
        mapa[clave].push(r);
      }
    }

    for (const clave in mapa) {
      if (mapa[clave].length > 1) {
        duplicados.push(mapa[clave]);
      }
    }

    res.json({
      ok: true,
      sede,
      duplicados
    });

  } catch (error) {
    console.error(
      "Error detectando duplicados de vendidos:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};


// ======================================================
// ELIMINAR VENDIDO DUPLICADO
// ======================================================
export const eliminarVendidoDuplicado = async (req, res) => {
  try {
    const sede = obtenerSede(req);

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const eliminado = await Vendidos.findOneAndDelete({
      _id: req.params.id,
      ...filtroSede
    });

    if (!eliminado) {
      return res.status(404).json({
        ok: false,
        error:
          "Registro no encontrado o no pertenece a esta sede"
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {
    console.error(
      "Error eliminando duplicado de vendidos:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
