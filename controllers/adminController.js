import Moneda from "../models/dbMoneda.js";

export const detectarDuplicadosMoneda = async (req, res) => {
  try {
    const pagos = await Moneda.find().lean();
    const mapa = {};
    const duplicados = [];
    for (const p of pagos) {
      const clave = `${p.factura}-${p.operacion}-${p.total}-${new Date(p.fecha).toISOString()}`;
      if (!mapa[clave]) {
        mapa[clave] = [p];
      } else {
        mapa[clave].push(p);
      }
    }
    for (const clave in mapa) {
      if (mapa[clave].length > 1) {
        duplicados.push(mapa[clave]);
      }
    }
    res.json({ ok: true, duplicados });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};

export const limpiarDuplicadosMoneda = async (req, res) => {
  try {
    const pagos = await Moneda.find().lean();
    const mapa = {};
    const duplicados = [];
    for (const p of pagos) {
      const clave = `${p.factura}-${p.operacion}-${p.total}-${new Date(p.fecha).toISOString()}`;

      if (!mapa[clave]) {
        mapa[clave] = [p];
      } else {
        mapa[clave].push(p);
      }
    }
    let eliminados = [];
    for (const clave in mapa) {
      if (mapa[clave].length > 1) {
        const [original, ...resto] = mapa[clave];
        for (const pago of resto) {
          await Moneda.findByIdAndDelete(pago._id);
          eliminados.push(pago._id);
        }
      }
    }
    res.json({ ok: true, eliminados });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
};
