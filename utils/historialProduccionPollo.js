import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { fallo } from "./controlCaja.js";

function comprobarTransaccion(session) {
  if (!session?.inTransaction()) {
    throw fallo(
      500,
      "La corrección debe realizarse dentro de una transacción."
    );
  }
}

function identificador(datos) {
  const loteId = String(datos.loteId || "").toLowerCase();
  const usuarioId = String(
    datos.usuarioId || ""
  ).toLowerCase();

  const claveOperacion = datos.claveOperacion;

  if (
    !/^[a-f0-9]{24}$/.test(loteId) ||
    !/^[a-f0-9]{24}$/.test(usuarioId) ||
    typeof claveOperacion !== "string" ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(claveOperacion)
  ) {
    throw fallo(
      400,
      "La solicitud de corrección no es válida."
    );
  }

  const hash = createHash("sha256")
    .update(
      `correccion-produccion:${loteId}:` +
      `${usuarioId}:${claveOperacion}`
    )
    .digest("hex");

  return new mongoose.Types.ObjectId(
    hash.slice(0, 24)
  );
}

function coleccionHistorial() {
  if (!mongoose.connection.db) {
    throw fallo(
      503,
      "La base de datos no está disponible."
    );
  }

  return mongoose.connection.db.collection(
    "historial_produccion_pollos"
  );
}

function copiarDocumento(documento) {
  return typeof documento?.toObject === "function"
    ? documento.toObject()
    : documento;
}

// =====================================================
// COMPROBAR SI LA CORRECCIÓN YA SE REALIZÓ
// =====================================================
export async function consultarCambioProduccion(
  datos,
  session
) {
  comprobarTransaccion(session);

  return coleccionHistorial().findOne(
    {
      _id: identificador(datos)
    },
    {
      session
    }
  );
}

// =====================================================
// GUARDAR EL HISTORIAL JUNTO CON LA CORRECCIÓN
// =====================================================
export async function guardarCambioProduccion(
  datos,
  session
) {
  comprobarTransaccion(session);

  if (
    !["MODIFICAR", "ELIMINAR"].includes(datos.accion) ||
    typeof datos.firmaSolicitud !== "string" ||
    !datos.firmaSolicitud ||
    !datos.antes
  ) {
    throw fallo(
      500,
      "Faltan datos para conservar el historial de producción."
    );
  }

  const produccionId = String(
    datos.produccionId || ""
  );

  if (!/^[a-fA-F0-9]{24}$/.test(produccionId)) {
    throw fallo(
      400,
      "La jornada indicada no es válida."
    );
  }

  if (
    datos.accion === "MODIFICAR" &&
    !datos.despues
  ) {
    throw fallo(
      500,
      "Falta el resultado de la modificación."
    );
  }

  await coleccionHistorial().insertOne(
    {
      _id: identificador(datos),
      loteId: new mongoose.Types.ObjectId(
        String(datos.loteId)
      ),
      produccionId: new mongoose.Types.ObjectId(
        produccionId
      ),
      usuarioId: new mongoose.Types.ObjectId(
        String(datos.usuarioId)
      ),
      accion: datos.accion,
      claveOperacion: datos.claveOperacion,
      firmaSolicitud: datos.firmaSolicitud,
      fecha: new Date(),
      antes: copiarDocumento(datos.antes),
      despues: datos.accion === "ELIMINAR"
        ? null
        : copiarDocumento(datos.despues)
    },
    {
      session
    }
  );
}