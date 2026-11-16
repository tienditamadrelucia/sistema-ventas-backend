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
  eliminarDocumento,
  modificarCantidadArticulo,
  eliminarArticulo
} from "../controllers/documentosInventario.js";

const router = express.Router();

// Todas las rutas requieren sesión.
router.use(autenticar);

// Debe aparecer antes de /:id.
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

// Verificar o reabrir un documento.
router.post(
  "/:id/revision",
  operacionDocumento(revisarDocumento)
);

// Modificar la cantidad de un artículo.
router.patch(
  "/:id/articulos/:articuloId",
  operacionDocumento(modificarCantidadArticulo)
);

// Eliminar únicamente un artículo.
router.delete(
  "/:id/articulos/:articuloId",
  operacionDocumento(eliminarArticulo)
);

// Eliminar el documento completo.
router.delete(
  "/:id",
  operacionDocumento(eliminarDocumento)
);

export default router;