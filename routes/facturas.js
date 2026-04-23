import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = req.body;

    const resultado = await db.collection("facturas").insertOne({
      ...factura,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando factura" });
  }
});

router.get("/:numero", async (req, res) => {
  try {
    const db = conectarDB();
    const numero = Number(req.params.numero);

    const factura = await db.collection("facturas").findOne({ numero });

    res.json(factura);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando factura" });
  }
});

router.get("/", async (req, res) => {
  try {
    const db = conectarDB();
    const facturas = await db.collection("facturas").find().toArray();

    res.json(facturas);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error listando facturas" });
  }
});

export default router;