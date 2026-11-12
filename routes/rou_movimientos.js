import express from "express";

import {
  movimientosConApertura
} from "../controllers/movimientosConApertura.js";

const router = express.Router();

router.get(
  "/:productoId",
  movimientosConApertura
);

export default router;