import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

// Registrar xvendidos (resumen)
router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const items = req.body; // puede ser un array o un solo objeto

    if (Array.isArray(items)) {
      const resultado = await db.collection("xvendidos").insertMany(items);
      res.json({ ok: true, insertados: resultado.insertedCount });
    } else {
      const resultado = await db.collection("xvendidos").insertOne(items);
      res.json({ ok: true, id: resultado.insertedId });
    }

  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando xvendidos" });
  }
});

// Obtener xvendidos por factura
router.get("/:factura", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = Number(req.params.factura);

    const items = await db.collection("xvendidos").find({ factura }).toArray();

    res.json(items);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando xvendidos" });
  }
});

// Listar todos
router.get("/", async (req, res) => {
  try {
    const db = conectarDB();
    const items = await db.collection("xvendidos").find().toArray();

    res.json(items);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error listando xvendidos" });
  }
});

export default router;