import express from "express";
import Tasas from "../models/dbTasas.js";

const router = express.Router();

// Función para normalizar fecha a UTC 00:00:00
function normalizarUTC(fecha) {
  const f = new Date(fecha);
  return new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0));
}

// 📌 Obtener la tasa del día
router.get("/hoy", async (req, res) => {
  try {
    const hoy = new Date();
    const inicio = normalizarUTC(hoy);
    const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
    const tasa = await Tasas.findOne({
      fecha: { $gte: inicio, $lt: fin }
    });
    return res.json({ ok: true, tasa });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Guardar tasas del día (solo si NO existen)
router.post("/guardar", async (req, res) => {
  try {
    const fecha = normalizarUTC(req.body.fecha);
    const existe = await Tasas.findOne({
      fecha: { $gte: fecha, $lt: new Date(fecha.getTime() + 86400000) }
    });
    if (existe) {
      return res.json({ ok: false, mensaje: "Las tasas del día ya existen" });
    }
    const nueva = await Tasas.create({
      fecha,
      cajachicaP: req.body.cajachicaP,
      cajachicaD: req.body.cajachicaD,
      tasaP: req.body.tasaP,
      tasaD: req.body.tasaD
    });
    return res.json({ ok: true, mensaje: "Tasas registradas", tasa: nueva });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Modificar tasas del día
router.put("/modificar", async (req, res) => {
  try {
    const hoy = new Date();
    const inicio = normalizarUTC(hoy);
    const fin = new Date(inicio.getTime() + 86400000);
    const tasa = await Tasas.findOne({
      fecha: { $gte: inicio, $lt: fin }
    });
    if (!tasa) {
      return res.json({ ok: false, mensaje: "No existen tasas para hoy" });
    }
    tasa.cajachicaP = req.body.cajachicaP;
    tasa.cajachicaD = req.body.cajachicaD;
    tasa.tasaP = req.body.tasaP;
    tasa.tasaD = req.body.tasaD;
    await tasa.save();
    return res.json({ ok: true, mensaje: "Tasas modificadas", tasa });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Obtener todas las tasas
router.get("/todas", async (req, res) => {
  try {
    const lista = await Tasas.find().sort({ fecha: -1 });
    return res.json({ ok: true, lista });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// 📌 Obtener tasa por fecha
router.get("/por-fecha/:fecha", async (req, res) => {
  try {
    const [año, mes, dia] = req.params.fecha.split("-").map(Number);
    // Inicio del día en UTC
    const inicio = new Date(Date.UTC(año, mes - 1, dia, 0, 0, 0));
    // Fin del día en UTC
    const fin = new Date(Date.UTC(año, mes - 1, dia + 1, 0, 0, 0));
    const tasa = await Tasas.findOne({
      fecha: { $gte: inicio, $lt: fin }
    });
    if (!tasa) {
      return res.status(404).json({ ok: false, msg: "No hay tasas para esa fecha" });
    }
    return res.json({ ok: true, tasa });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: "Error obteniendo tasa por fecha" });
  }
});

export default router;