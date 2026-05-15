import Moneda from "../models/dbMoneda.js";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";

// ===============================
// FUNCIÓN REUTILIZABLE
// ===============================
const detectarDuplicados = (registros) => {
  const mapa = {};
  const duplicados = [];
  for (const r of registros) {
    let fechaISO = "FECHA_INVALIDA";
    try {
      const f = new Date(r.fecha);
      // Validar fecha real
      if (!isNaN(f.getTime())) {
        // Convertir SIEMPRE a UTC
        fechaISO = new Date(Date.UTC(
          f.getUTCFullYear(),
          f.getUTCMonth(),
          f.getUTCDate(),
          f.getUTCHours(),
          f.getUTCMinutes(),
          f.getUTCSeconds()
        )).toISOString();
      }
    } catch {
      fechaISO = "FECHA_INVALIDA";
    }
    const clave = `${r.factura}-${r.operacion}-${r.total}-${fechaISO}`;
    if (!mapa[clave]) mapa[clave] = [r];
    else mapa[clave].push(r);
  }
  for (const clave in mapa) {
    if (mapa[clave].length > 1) duplicados.push(mapa[clave]);
  }
  return duplicados;
};


// ===============================
// PAGOS (MONEDA)
// ===============================
export const detectarDuplicadosMoneda = async (req, res) => {
  try {
    const registros = await Moneda.find().lean();
    const duplicados = detectarDuplicados(registros);
    res.json({ ok: true, duplicados });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

export const limpiarDuplicadoMoneda = async (req, res) => {
  try {
    await Moneda.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

// ===============================
// VENTAS
// ===============================
export const detectarDuplicadosVentas = async (req, res) => {
  try {
    const registros = await Ventas.find().lean();
    const duplicados = detectarDuplicados(registros);
    res.json({ ok: true, duplicados });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

export const eliminarVentaDuplicada = async (req, res) => {
  try {
    await Ventas.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

// ===============================
// VENDIDOS
// ===============================
export const detectarDuplicadosVendidos = async (req, res) => {
  try {
    const registros = await Vendidos.find()
    .populate("productoId", "codigo descripcion") // ← aquí traemos código y nombre
    .lean();
    const mapa = {};
    const duplicados = [];
    for (const r of registros) {
      // Usamos createdAt como referencia de tiempo
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
      const clave = `${r.factura}-${r.productoId}-${r.total}-${fechaISO}`;
      if (!mapa[clave]) mapa[clave] = [r];
      else mapa[clave].push(r);
    }
    for (const clave in mapa) {
      if (mapa[clave].length > 1) duplicados.push(mapa[clave]);
    }
    res.json({ ok: true, duplicados });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

export const eliminarVendidoDuplicado = async (req, res) => {
  try {
    await Vendidos.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};
