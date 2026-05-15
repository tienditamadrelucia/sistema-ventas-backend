import express from "express";
import { detectarDuplicadosMoneda, limpiarDuplicadosMoneda } from "../controllers/adminController.js";

const router = express.Router();

router.get("/duplicados/moneda", detectarDuplicadosMoneda);
router.delete("/limpiar/moneda", limpiarDuplicadosMoneda);

export default router;
