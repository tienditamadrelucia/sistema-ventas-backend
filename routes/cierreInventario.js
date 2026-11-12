import express from "express";

import {
  autenticar
} from "../utils/controlCaja.js";

import {
  vistaPreviaCierreInventario
} from "../controllers/cierreInventario.js";

import {
  paginaAdministrativaStock,
  vistaRegularizacionStock,
  aplicarRegularizacionStock
} from "../controllers/regularizacionStock.js";

const router = express.Router();

router.use(autenticar);

router.get(
  "/vista-previa",
  vistaPreviaCierreInventario
);

router.get(
  "/regularizar-octubre",
  paginaAdministrativaStock
);

router.get(
  "/regularizacion-stock/vista-previa",
  vistaRegularizacionStock
);

router.post(
  "/regularizacion-stock/aplicar",
  aplicarRegularizacionStock
);

export default router;