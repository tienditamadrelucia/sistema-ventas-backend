import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDBDB();
    const caja = req.body;

    const resultado = await db.collection("caja").insertOne({
      ...caja,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando caja" });
  }
});

router.get("/:fecha", async (req, res) => {
  try {
    const db = conectarDB();
    const fecha = req.params.fecha;

    const movimientos = await db.collection("caja").find({ fecha }).toArray();

    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando caja" });
  }
});

export default router;   // ← ESTA LÍNEA ES OBLIGATORIA