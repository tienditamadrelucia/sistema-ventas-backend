import express from "express";
import Tasas from "../models/dbTasas.js"

const router = express.Router();

// 📌 Obtener la tasa del día
router.get("/hoy", async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10); // Para obtener "YYYY-MM-DD"
    const tasa = await Tasas.findOne({
      fecha: hoy // Buscar por la cadena de la fecha
    });
    res.json({ ok: true, tasa });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Guardar tasas del día (solo si NO existen)
router.post("/guardar", async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD
    const existe = await Tasas.findOne({ fecha: hoy }); // Verificación correcta
    if (existe) {
      return res.json({ ok: false, mensaje: "Las tasas del día ya existen" });
    }
    const nueva = await Tasas.create({
      fecha: hoy, // Asegúrate de guardar la fecha en el formato correcto
      cajachicaP: req.body.cajachicaP,
      cajachicaD: req.body.cajachicaD,
      tasaP: req.body.tasaP,
      tasaD: req.body.tasaD
    });
    res.json({ ok: true, mensaje: "Tasas registradas", nueva });    
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Modificar tasas del día (solo HOY)
router.put("/modificar", async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD
    const tasa = await Tasas.findOne({ fecha: hoy });
    if (!tasa) {
      return res.json({ ok: false, mensaje: "No existen tasas para hoy" });
    }
    tasa.cajachicaP = req.body.cajachicaP;
    tasa.cajachicaD = req.body.cajachicaD;
    tasa.tasaP = req.body.tasaP;
    tasa.tasaD = req.body.tasaD;
    await tasa.save();
    res.json({ ok: true, mensaje: "Tasas modificadas", tasa });    
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Obtener todas las tasas (solo lectura)
router.get("/todas", async (req, res) => {
  try {
    const lista = await Tasas.find().sort({ fecha: -1 });
    res.json({ ok: true, lista });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/por-fecha/:fecha", async (req, res) => {
  try {
    const fecha = req.params.fecha; // formato YYYY-MM-DD
    const tasa = await Tasas.findOne({ fecha });
    if (!tasa) {
      return res.status(404).json({ ok: false, msg: "No hay tasas para esa fecha" });
    }
    return res.json({ ok: true, tasa });
  } catch (error) {
    console.error("Error obteniendo tasa por fecha:", error);
    return res.status(500).json({ ok: false, msg: "Error obteniendo tasa por fecha" });
  }
});

export default router;
