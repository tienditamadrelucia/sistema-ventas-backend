import express from "express";

import {
  autenticar
} from "../utils/controlCaja.js";

import {
  vistaPreviaCierreInventario
} from "../controllers/cierreInventario.js";

const router = express.Router();

router.use(autenticar);

// Sólo lectura y sólo administrador.
router.get(
  "/vista-previa",
  vistaPreviaCierreInventario
);

export default router;