import mongoose from "mongoose";

import DocumentoInventario from "../models/DocumentoInventario.js";

// Protege los artículos vinculados a un documento.
// Se utilizará en las rutas de editar y eliminar.
export async function protegerDocumentoInventario(
  req,
  res,
  next
) {
  try {
    if (
      !["PUT", "PATCH", "DELETE"].includes(req.method)
    ) {
      return next();
    }

    const id = req.params.id;

    if (
      typeof id !== "string" ||
      !/^[a-f\d]{24}$/i.test(id)
    ) {
      return next();
    }

    let campo;

    if (req.baseUrl.includes("entradas")) {
      campo = "detalles.entradaId";
    } else if (req.baseUrl.includes("salidas")) {
      campo = "detalles.salidaId";
    } else {
      const mensaje =
        "No se pudo identificar la ruta del movimiento.";

      return res.status(500).json({
        ok: false,
        error: mensaje,
        mensaje
      });
    }

    const documento = await DocumentoInventario
      .findOne({
        [campo]: new mongoose.Types.ObjectId(id)
      })
      .select("_id")
      .session(req.cajaMongo || null)
      .lean();

    if (documento) {
      const mensaje =
        "Este artículo pertenece a un documento de inventario. " +
        "Consulte y corrija el documento completo desde Entradas y Salidas. " +
        "Si está verificado, la administradora debe reabrirlo primero.";

      return res.status(409).json({
        ok: false,
        error: mensaje,
        mensaje
      });
    }

    return next();
  } catch (error) {
    console.error(
      "Error comprobando documento de inventario:",
      error
    );

    const mensaje =
      "No se pudo comprobar si el movimiento " +
      "pertenece a un documento. Intente nuevamente.";

    return res.status(500).json({
      ok: false,
      error: mensaje,
      mensaje
    });
  }
}