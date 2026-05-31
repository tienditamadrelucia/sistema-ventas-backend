// rou_cierreMes.js
// Cierre de mes para: dbCaja, dbGastos, dbInventario, dbSalidas, dbVentas, dbEntrada

const express = require("express");
const router = express.Router();

// IMPORTA TUS MODELOS (ajusta las rutas según tu proyecto)
const dbCaja = require("./models/dbCaja");
const dbGastos = require("./models/dbGastos");
const dbInventario = require("./models/dbInventario");
const dbSalidas = require("./models/dbSalidas");
const dbVentas = require("./models/dbVentas");
const dbEntrada = require("./models/Entrada");

// ⚠️ IMPORTANTE: en cada schema debe existir:
// cierre: { type: String, default: "N" }
// mes: Number
// año: Number

// =========================
//  CIERRE GENERAL DE MES
// =========================
// POST /api/cierre-mes
// body: { mes: 5, año: 2026 }

router.post("/cierre-mes", async (req, res) => {
  const { mes, año } = req.body;

  const inicio = new Date(año, mes - 1, 1);
  const fin = new Date(año, mes - 1, 31);

  try {
    await dbVentas.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, estado: "CONTADO", cierre: "N" },
      { $set: { cierre: "S" } }
    );

    await dbEntrada.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, cierre: "N" },
      { $set: { cierre: "S" } }
    );

    await dbSalidas.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, cierre: "N" },
      { $set: { cierre: "S" } }
    );

    await dbGastos.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, cierre: "N" },
      { $set: { cierre: "S" } }
    );

    await dbCaja.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, cierre: "N" },
      { $set: { cierre: "S" } }
    );

    await dbInventario.updateMany(
      { fecha: { $gte: inicio, $lte: fin }, cierre: "N" },
      { $set: { cierre: "S" } }
    );

    res.json({ ok: true, mensaje: "Cierre de mes completado" });

  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

module.exports = router;
