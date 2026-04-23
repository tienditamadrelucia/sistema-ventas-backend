import express from "express";
import { conectarDB} from "../db/conexion.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const db = conectarDB();
    const vuelto = req.body;

    const resultado = await db.collection("vueltos").insertOne({
      ...vuelto,
      fechaRegistro: new Date()
    });

    res.json({ ok: true, id: resultado.insertedId });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error guardando vuelto" });
  }
});

router.get("/:factura", async (req, res) => {
  try {
    const db = conectarDB();
    const factura = Number(req.params.factura);

    const vuelto = await db.collection("vueltos").findOne({ factura });

    res.json(vuelto);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando vuelto" });
  }
});

export default router;