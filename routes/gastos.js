import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

// Registrar gasto
router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const gasto = req.body;

    const resultado = await db.collection("gastos").insertOne({
      ...gasto,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando gasto" });
  }
});

// Listar gastos
router.get("/", async (req, res) => {
  try {
    const db = conectarDB();
    const gastos = await db.collection("gastos").find().toArray();

    res.json(gastos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error listando gastos" });
  }
});

// Buscar gastos por fecha
router.get("/fecha/:fecha", async (req, res) => {
  try {
    const db = conectarDB();
    const fecha = req.params.fecha;

    const gastos = await db.collection("gastos").find({ fecha }).toArray();

    res.json(gastos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando gastos" });
  }
});

export default router;