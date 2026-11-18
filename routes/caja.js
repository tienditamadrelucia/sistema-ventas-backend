
import express from "express";
import { conectarDB } from "../db/conexion.js";
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const caja = req.body;
    if (!caja.fecha || !caja.sede) {
      return res.status(400).json({ ok: false, error: "Faltan la fecha o la sede del cuadre." });
    }
    const resultado = await db.collection("caja").insertOne({
      ...caja,
      fechaRegistro: new Date()
    });
    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    console.error("ERROR GUARDANDO CAJA:", error);
    res.status(500).json({ ok: false, error: "Error guardando caja", detalle: error.message });
  }
});

router.get("/:fecha", async (req, res) => {
  try {
    const db = conectarDB();
    const { fecha } = req.params;
    const sede = req.query.sede || "TIENDITA";
    const cuadre = await db.collection("caja").findOne({ fecha, sede });
    res.json({ ok: true, existe: !!cuadre, cuadre });
  } catch (error) {
    console.error("ERROR CONSULTANDO CAJA:", error);
    res.status(500).json({ ok: false, error: "Error consultando caja" });
  }
});

export default router;
