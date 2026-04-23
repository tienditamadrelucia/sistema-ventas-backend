import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const items = req.body;

    const resultado = await db.collection("vendidos").insertMany(items);

    res.json({ ok: true, insertados: resultado.insertedCount });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando vendidos" });
  }
});

router.get("/:factura", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = Number(req.params.factura);

    const items = await db.collection("vendidos").find({ factura }).toArray();

    res.json(items);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando vendidos" });
  }
});

export default router;