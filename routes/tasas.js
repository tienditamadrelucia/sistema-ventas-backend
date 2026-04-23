import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const tasas = req.body;

    const resultado = await db.collection("tasas").insertOne({
      ...tasas,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando tasas" });
  }
});

router.get("/ultima", async (req, res) => {
  try {
    const db = conectarDB();

    const tasa = await db.collection("tasas")
      .find()
      .sort({ fechaRegistro: -1 })
      .limit(1)
      .toArray();

    res.json(tasa[0]);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando tasas" });
  }
});

export default router;