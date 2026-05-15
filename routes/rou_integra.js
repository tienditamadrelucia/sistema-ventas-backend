import express from "express";
import {
  detectarDuplicadosMoneda,
  limpiarDuplicadoMoneda,
  detectarDuplicadosVentas,
  eliminarVentaDuplicada,
  detectarDuplicadosVendidos,
  eliminarVendidoDuplicado
} from "../controllers/adminController.js";

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

export default router;
