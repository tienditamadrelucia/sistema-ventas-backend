import express from "express";
import Tasas from "../models/dbTasas.js";
import Moneda from "../models/dbMoneda.js";
import Gastos from "../models/dbGastos.js";
import Caja from "../models/dbCaja.js";

const router = express.Router();

// ===============================
// CONSULTAR CUADRE DEL DÍA
// ===============================
router.get("/:fecha", async (req, res) => {
    try {
        const { fecha } = req.params;
        // Validación básica
        if (!fecha || fecha.length !== 10) {
            return res.json({
                ok: false,
                mensaje: "Fecha inválida",
                existe: false
            });
        }
        // Buscar si existe un cuadre para esa fecha
        const cuadre = await Caja.findOne({ fecha });
        if (!cuadre) {
            return res.json({
                ok: true,
                existe: false,
                mensaje: "No existe cuadre para esta fecha"
            });
        }
        // Si existe, devolverlo
        return res.json({
            ok: true,
            existe: true,
            mensaje: "Cuadre encontrado",
            cuadre
        });
    } catch (error) {
        console.error("ERROR EN VERIFICAR FECHA:", error);
        return res.status(500).json({
            ok: false,
            existe: false,
            mensaje: "Error interno del servidor",
            error: error.message
        });
    }
});


// ===============================
// GUARDAR / CERRAR CAJA DEL DÍA
// ===============================
router.post("/", async (req, res) => {
  try {
    const nuevo = new Caja(req.body);
    await nuevo.save();
    res.json({ ok: true, caja: nuevo });
  } catch (error) {
    console.error("Error guardando caja:", error);
    res.status(500).json({ ok: false, error: "Error guardando caja" });
  }
});

// ===============================
// HISTORIAL DE CAJA
// ===============================
router.get("/", async (req, res) => {
  try {
    const lista = await Caja.find().sort({ fecha: -1 });
    res.json({ ok: true, lista });
  } catch (error) {
    console.error("Error listando caja:", error);
    res.status(500).json({ ok: false, error: "Error listando caja" });
  }
});

// ===============================
// ACTUALIZAR CAJA DEL DÍA
// ===============================
router.put("/", async (req, res) => {
  try {
    const { _id, ...resto } = req.body;

    if (!_id) {
      return res.json({
        ok: false,
        mensaje: "Falta el _id del cuadre"
      });
    }

    const actualizado = await Caja.findByIdAndUpdate(
      _id,
      resto,
      { new: true }
    );

    if (!actualizado) {
      return res.json({
        ok: false,
        mensaje: "No se encontró el cuadre para actualizar"
      });
    }

    return res.json({
      ok: true,
      mensaje: "Cuadre actualizado correctamente",
      cuadre: actualizado
    });

  } catch (error) {
    console.error("ERROR ACTUALIZANDO CAJA:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error actualizando el cuadre",
      error: error.message
    });
  }
});


export default router;
