import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

// Registrar crédito
router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const credito = req.body;

    const resultado = await db.collection("credito").insertOne({
      ...credito,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando crédito" });
  }
});

// Obtener crédito por factura
router.get("/:factura", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = Number(req.params.factura);

    const credito = await db.collection("credito").findOne({ factura });

    res.json(credito);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando crédito" });
  }
});

// Listar créditos
router.get("/", async (req, res) => {
  try {
    const db = conectarDB();
    const creditos = await db.collection("credito").find().toArray();

    res.json(creditos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error listando créditos" });
  }
});

export default router;