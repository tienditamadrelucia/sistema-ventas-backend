import express from "express";
import {
  detectarDuplicadosMoneda,
  limpiarDuplicadoMoneda,
  detectarDuplicadosVentas,
  eliminarVentaDuplicada,
  detectarDuplicadosVendidos,
  eliminarVendidoDuplicado
} from "../controllers/adminController.js";
import Vendidos from "../models/dbVendidos.js";

const router = express.Router();

// PAGOS (MONEDA)
router.get("/duplicados/moneda", detectarDuplicadosMoneda);
router.delete("/eliminar/moneda/:id", limpiarDuplicadoMoneda);

// VENTAS
router.get("/duplicados/ventas", detectarDuplicadosVentas);
router.delete("/eliminar/ventas/:id", eliminarVentaDuplicada);

// VENDIDOS
router.get("/duplicados/vendidos", detectarDuplicadosVendidos);
router.delete("/eliminar/vendidos/:id", eliminarVendidoDuplicado);

router.get("/vendidos-todos", async (req, res) => {
  try {
    const registros = await Vendidos.find()
      .populate("productoId", "codigo descripcion")
      .sort({ factura: 1 });
    res.json({ ok: true, registros });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

export default router;
