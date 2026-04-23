import express from "express";
import Usuario from "../models/Usuario.js";

const router = express.Router();

// LISTAR
router.get("/", async (req, res) => {
  try {
    const usuarios = await Usuario.find();
    res.json(usuarios);
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ ok: false, error: "Error listando usuarios" });
  }
});

// BUSCAR POR USUARIO
router.get("/:usuario", async (req, res) => {
  try {
    const user = await Usuario.findOne({ usuario: req.params.usuario });
    res.json(user);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando usuario" });
  }
});

// ACTUALIZAR
router.put("/:id", async (req, res) => {
  try {
    const actualizado = await Usuario.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ ok: true, usuario: actualizado });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error actualizando usuario" });
  }
});

// ELIMINAR
router.delete("/:id", async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error eliminando usuario" });
  }
});

export default router;