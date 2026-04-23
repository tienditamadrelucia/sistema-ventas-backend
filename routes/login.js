import express from "express";
import Usuario from "../models/Usuario.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { usuario, clave } = req.body;

    const encontrado = await Usuario.findOne({ usuario, clave });

    if (!encontrado) {
      return res.json({ ok: false });
    }

    res.json({
      ok: true,
      usuario: encontrado.usuario,
      nombre: encontrado.nombre,
      rol: encontrado.rol
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ ok: false, error: "Error en login" });
  }
});

export default router;