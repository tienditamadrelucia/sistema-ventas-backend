import express from "express";
import { autenticar } from "../utils/controlCaja.js";

import {
  registrarEnvioLote
} from "../controllers/enviarLote.js";

import {
  registrarRecepcionEnvioLote
} from "../controllers/recibirEnvioLote.js";

import {
  listarEnviosLote,
  obtenerEnvioLote
} from "../controllers/consultarEnviosLote.js";

const router = express.Router();

router.use(autenticar);

// Consultar envíos según la sede autorizada.
router.get("/", listarEnviosLote);

// Monasterio confirma un envío del lote.
router.post(
  "/lote/:id",
  registrarEnvioLote
);

// Consultar un envío.
router.get(
  "/:envioId",
  obtenerEnvioLote
);

// Tiendita confirma la recepción.
router.post(
  "/:envioId/recepcion",
  registrarRecepcionEnvioLote
);

export default router;