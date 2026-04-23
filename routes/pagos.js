import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const pago = req.body;

    const resultado = await db.collection("pagos").insertOne({
      ...pago,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando pago" });
  }
});

router.get("/:factura", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = Number(req.params.factura);

    const pagos = await db.collection("pagos").find({ factura }).toArray();

    res.json(pagos);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando pagos" });
  }
});

export default router;