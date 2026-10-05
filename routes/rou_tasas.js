import express from "express";
import Tasas from "../models/dbTasas.js";

const router = express.Router();

// ======================================================
// NORMALIZAR FECHA
// Las fechas YYYY-MM-DD se conservan exactamente.
// Para "hoy", se toma el día actual de Venezuela.
// ======================================================
function normalizarUTC(fecha = null) {

  // ----------------------------------------------------
  // 1. Si viene del frontend como YYYY-MM-DD,
  // NO convertir primero con new Date(),
  // porque eso puede retroceder un día en Venezuela.
  // ----------------------------------------------------
  if (
    typeof fecha === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(fecha)
  ) {
    const [year, month, day] =
      fecha.split("-").map(Number);

    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        0,
        0,
        0
      )
    );
  }

  // ----------------------------------------------------
  // 2. Si necesitamos obtener "hoy",
  // tomamos expresamente la fecha de Venezuela.
  // ----------------------------------------------------
  const fechaBase =
    fecha instanceof Date
      ? fecha
      : new Date();

  const partes = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(fechaBase);

  const year = Number(
    partes.find(
      (p) => p.type === "year"
    ).value
  );

  const month = Number(
    partes.find(
      (p) => p.type === "month"
    ).value
  );

  const day = Number(
    partes.find(
      (p) => p.type === "day"
    ).value
  );

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0
    )
  );
}


// ======================================================
// OBTENER LA TASA DEL DÍA POR SEDE
// ======================================================

router.get("/hoy", async (req, res) => {
  try {

    const sede = req.query.sede || "TIENDITA";

    const hoy = new Date();
    const inicio = normalizarUTC(hoy);
    const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

    const tasa = await Tasas.findOne({
      sede,
      fecha: {
        $gte: inicio,
        $lt: fin
      }
    });

    return res.json({
      ok: true,
      tasa
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


// ======================================================
// GUARDAR TASAS DEL DÍA POR SEDE
// ======================================================

router.post("/guardar", async (req, res) => {
  try {

    const sede = req.body.sede || "TIENDITA";
    const fecha = normalizarUTC(req.body.fecha);

    const existe = await Tasas.findOne({
      sede,
      fecha: {
        $gte: fecha,
        $lt: new Date(fecha.getTime() + 86400000)
      }
    });

    if (existe) {
      return res.json({
        ok: false,
        mensaje: `Las tasas del día ya existen para ${sede}`
      });
    }

    const nueva = await Tasas.create({
      fecha,
      sede,
      cajachicaP: req.body.cajachicaP,
      cajachicaD: req.body.cajachicaD,
      tasaP: req.body.tasaP,
      tasaD: req.body.tasaD
    });

    return res.json({
      ok: true,
      mensaje: "Tasas registradas",
      tasa: nueva
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


// ======================================================
// MODIFICAR TASAS
// ======================================================

router.put("/modificar/:id", async (req, res) => {
  try {

    const tasa = await Tasas.findById(req.params.id);

    if (!tasa) {
      return res.json({
        ok: false,
        mensaje: "No existen tasas para hoy"
      });
    }

    tasa.cajachicaP = req.body.cajachicaP;
    tasa.cajachicaD = req.body.cajachicaD;
    tasa.tasaP = req.body.tasaP;
    tasa.tasaD = req.body.tasaD;

    if (req.body.sede) {
      tasa.sede = req.body.sede;
    }

    await tasa.save();

    return res.json({
      ok: true,
      mensaje: "Tasas modificadas",
      tasa
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


// ======================================================
// HISTORIAL DE TASAS POR SEDE
// ======================================================

router.get("/todas", async (req, res) => {
  try {

    const sede = req.query.sede || "TIENDITA";

    const lista = await Tasas.find({
      sede
    }).sort({
      fecha: -1
    });

    return res.json({
      ok: true,
      lista
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


// ======================================================
// OBTENER TASA POR FECHA Y SEDE
// ======================================================

router.get("/por-fecha/:fecha", async (req, res) => {
  try {

    const sede = req.query.sede || "TIENDITA";

    const [año, mes, dia] =
      req.params.fecha.split("-").map(Number);

    const inicio = new Date(
      Date.UTC(año, mes - 1, dia, 0, 0, 0)
    );

    const fin = new Date(
      Date.UTC(año, mes - 1, dia + 1, 0, 0, 0)
    );

    const tasa = await Tasas.findOne({
      sede,
      fecha: {
        $gte: inicio,
        $lt: fin
      }
    });

    if (!tasa) {

      return res.status(404).json({
        ok: false,
        msg: `No hay tasas para esa fecha en ${sede}`
      });

    }

    return res.json({
      ok: true,
      tasa
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      msg: "Error obteniendo tasa por fecha"
    });

  }
});


export default router;