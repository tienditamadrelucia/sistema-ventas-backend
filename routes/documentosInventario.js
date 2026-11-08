import express from "express";

import {
  autenticar
} from "../utils/controlCaja.js";

import {
  operacionDocumento
} from "../utils/operacionDocumentoInventario.js";

import {
  opcionesDocumentos,
  listarDocumentos,
  obtenerDocumento,
  crearDocumento,
  revisarDocumento,
  eliminarDocumento
} from "../controllers/documentosInventario.js";

const router = express.Router();

// Todas las rutas requieren sesión.
router.use(autenticar);

// Debe aparecer antes de la ruta /:id.
router.get(
  "/opciones",
  opcionesDocumentos
);

// Consultar documentos.
router.get(
  "/",
  listarDocumentos
);

// Consultar el detalle de un documento.
router.get(
  "/:id",
  obtenerDocumento
);

// Guardar un documento completo.
router.post(
  "/",
  operacionDocumento(crearDocumento)
);

// Verificar o reabrir.
// El controlador exige administrador.
router.post(
  "/:id/revision",
  operacionDocumento(revisarDocumento)
);

// Eliminar el documento completo.
router.delete(
  "/:id",
  operacionDocumento(eliminarDocumento)
);

export default router;