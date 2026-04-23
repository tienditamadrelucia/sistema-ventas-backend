import express from "express";
import dbGastos from "../models/dbGastos.js";

const router = express.Router();

// CREAR GASTO
router.post("/", async (req, res) => {
  try {
    const nuevo = new dbGastos(req.body);
    await nuevo.save();
    res.json({ ok: true, gasto: nuevo });
  } catch (error) {
    console.error("Error creando gasto:", error);
    res.status(500).json({ ok: false, error: "Error creando gasto" });
  }
});

// LISTAR GASTOS
router.get("/", async (req, res) => {
  try {
    const lista = await dbGastos.find().sort({ fecha: -1 });
    res.json({ ok: true, lista });
  } catch (error) {
    console.error("Error listando gastos:", error);
    res.status(500).json({ ok: false, error: "Error listando gastos" });
  }
});

// OBTENER GASTO POR ID
router.get("/:id", async (req, res) => {
  try {
    const gasto = await dbGastos.findById(req.params.id);
    res.json({ ok: true, gasto });
  } catch (error) {
    console.error("Error obteniendo gasto:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo gasto" });
  }
});

// MODIFICAR GASTO
router.put("/:id", async (req, res) => {
  try {
    const actualizado = await dbGastos.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ ok: true, gasto: actualizado });
  } catch (error) {
    console.error("Error actualizando gasto:", error);
    res.status(500).json({ ok: false, error: "Error actualizando gasto" });
  }
});

// ELIMINAR GASTO
router.delete("/:id", async (req, res) => {
  try {
    await dbGastos.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando gasto:", error);
    res.status(500).json({ ok: false, error: "Error eliminando gasto" });
  }
});

router.get("/gastos/:dia", async (req, res) => {
  try {
    const dia = new Date(req.params.dia);
    const siguiente = new Date(dia);
    siguiente.setDate(siguiente.getDate() + 1);
    const lista = await Gastos.find({
      fecha: { $gte: dia, $lt: siguiente },
      cajaChica: true
    });
    return res.json({ ok: true, lista });
  } catch (error) {
    console.error("Error buscando gastos por fecha:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});


export default router;
