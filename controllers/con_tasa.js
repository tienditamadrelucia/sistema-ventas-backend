// controllers/con_tasa.js
import Tasa from "../models/Tasa.js";

// ---------------------------------------------------------
// FUNCIÓN PROFESIONAL PARA FIJAR LA FECHA LOCAL (VENEZUELA)
// ---------------------------------------------------------
function obtenerFechaLocal() {
  const ahora = new Date();
  const offsetMinutos = ahora.getTimezoneOffset(); 
  const local = new Date(ahora.getTime() - offsetMinutos * 60000);
  return local.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------
// REGISTRAR TASA DEL DÍA
// ---------------------------------------------------------
export const registrarTasa = async (req, res) => {
  try {
    const fecha = obtenerFechaLocal();
    const { tasaDolar, tasaPeso, cajaDolar, cajaPeso } = req.body;
    // Verificar si ya existe una tasa para hoy
    const existente = await Tasa.findOne({ fecha });
    if (existente) {
      return res.json({
        ok: false,
        mensaje: "Ya existe una tasa registrada para hoy"
      });
    }
    const nuevaTasa = new Tasa({
      fecha,
      tasaDolar,
      tasaPeso,
      cajaDolar,
      cajaPeso
    });
    await nuevaTasa.save();
    res.json({
      ok: true,
      mensaje: "Tasa registrada correctamente",
      tasa: nuevaTasa
    });
  } catch (error) {
    console.error("❌ Error al registrar tasa:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor al registrar tasa"
    });
  }
};

// ---------------------------------------------------------
// OBTENER TASA DEL DÍA
// ---------------------------------------------------------
export const obtenerTasaHoy = async (req, res) => {
  try {
    const fecha = obtenerFechaLocal();
    const tasa = await Tasa.findOne({ fecha });
    if (!tasa) {
      return res.json({
        ok: false,
        mensaje: "No hay tasa registrada para hoy"
      });
    }
    res.json({
      ok: true,
      tasa
    });
  } catch (error) {
    console.error("❌ Error al obtener tasa:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor al obtener tasa"
    });
  }
};

// ---------------------------------------------------------
// OBTENER TODAS LAS TASAS
// ---------------------------------------------------------
export const obtenerTasas = async (req, res) => {
  try {
    const tasas = await Tasa.find().sort({ fecha: -1 });
    res.json({
      ok: true,
      tasas
    });
  } catch (error) {
    console.error("❌ Error al obtener tasas:", error);
    res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor al obtener tasas"
    });
  }
};
