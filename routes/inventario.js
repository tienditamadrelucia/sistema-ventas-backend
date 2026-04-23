import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const item = req.body;

    const resultado = await db.collection("inventario").insertOne(item);

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando inventario" });
  }
});

router.get("/:codigo", async (req, res) => {
  try {
    const db = conectarDB();
    const codigo = req.params.codigo;

    const item = await db.collection("inventario").findOne({ codigo });

    res.json(item);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando inventario" });
  }
});

export default router;