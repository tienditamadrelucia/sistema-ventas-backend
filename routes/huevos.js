import express from "express";

import {
  autenticar
} from "../utils/controlCaja.js";

import {
  consultarHuevos,
  obtenerConfiguracionHuevos,
  configurarHuevos,
  guardarGrupo,
  eliminarGrupo,
  guardarMovimiento,
  eliminarMovimiento,
  recibirHuevos,
  gastosHuevos,
  disponiblesGastosHuevos,
  guardarGastoHuevos,
  desvincularGastoHuevos,
  informeHuevos,
  escrituraHuevos
} from "../controllers/huevos.js";

const router = express.Router();

// TODAS LAS RUTAS REQUIEREN SESIÓN
router.use(autenticar);

// CONSULTAS
router.get(
  "/",
  consultarHuevos
);

router.get(
  "/configuracion",
  obtenerConfiguracionHuevos
);

router.get(
  "/gastos",
  gastosHuevos
);

router.get(
  "/gastos/disponibles",
  disponiblesGastosHuevos
);

router.get(
  "/informe",
  informeHuevos
);

// CONFIGURACIÓN INICIAL
router.post(
  "/configuracion",
  escrituraHuevos(configurarHuevos)
);

// GRUPOS DE GALLINAS
router.post(
  "/grupos",
  escrituraHuevos(guardarGrupo)
);

router.put(
  "/grupos/:id",
  escrituraHuevos(guardarGrupo)
);

router.delete(
  "/grupos/:id",
  escrituraHuevos(eliminarGrupo)
);

// PRODUCCIÓN, BAJAS, CONSUMO, PÉRDIDAS Y ENVÍOS
router.post(
  "/movimientos",
  escrituraHuevos(guardarMovimiento)
);

router.put(
  "/movimientos/:id",
  escrituraHuevos(guardarMovimiento)
);

router.delete(
  "/movimientos/:id",
  escrituraHuevos(eliminarMovimiento)
);

// RECEPCIÓN EN TIENDITA
router.post(
  "/envios/:id/recepcion",
  escrituraHuevos(recibirHuevos)
);

router.put(
  "/envios/:id/recepcion",
  escrituraHuevos(recibirHuevos)
);

// GASTOS: REGISTRAR, VINCULAR O DESVINCULAR
router.post(
  "/gastos",
  escrituraHuevos(guardarGastoHuevos)
);

router.delete(
  "/gastos/:id/asignacion",
  escrituraHuevos(desvincularGastoHuevos)
);

export default router;