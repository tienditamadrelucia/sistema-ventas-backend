import express from "express";
import { crearVendido, obtenerVendidosPorVenta } from "../controllers/con_vendidos.js";
//ruta: /api/vendidos

const router = express.Router();

router.post("/", crearVendido);
router.get("/:factura", obtenerVendidosPorVenta);

export default router;
