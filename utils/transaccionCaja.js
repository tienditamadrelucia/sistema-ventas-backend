import mongoose from "mongoose";
import { createHash } from "node:crypto";

export function errorCaja(estado, mensaje) {
  const error = new Error(mensaje);
  error.estado = estado;
  return error;
}

export function diaCaja(fecha) {
  const texto =
    fecha instanceof Date &&
    !Number.isNaN(fecha.getTime())
      ? fecha.toISOString()
      : fecha;

  if (
    typeof texto !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(texto)
  ) {
    throw errorCaja(400, "Debe indicar una fecha válida");
  }

  const dia = texto.slice(0, 10);
  const inicio = new Date(`${dia}T00:00:00.000Z`);

  if (
    Number.isNaN(inicio.getTime()) ||
    inicio.toISOString().slice(0, 10) !== dia
  ) {
    throw errorCaja(400, "Fecha inválida");
  }

  return dia;
}

export function claveDia(fecha, sede) {
  if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
    throw errorCaja(400, "Sede inválida");
  }

  return `${sede}:${diaCaja(fecha)}`;
}

function controlId(fecha, sede) {
  const hash = createHash("sha256")
    .update(
      `SistemaVentas:control-dia:${claveDia(fecha, sede)}`
    )
    .digest("hex");

  return new mongoose.Types.ObjectId(
    hash.slice(0, 24)
  );
}

function coleccionControl() {
  if (!mongoose.connection.db) {
    throw errorCaja(
      503,
      "La base de datos no está disponible"
    );
  }

  return mongoose.connection.db.collection("caja");
}

export async function revisionDia(
  fecha,
  sede,
  session
) {
  const doc = await coleccionControl().findOne(
    { _id: controlId(fecha, sede) },
    { session }
  );

  return Number(doc?.revision || 0);
}

export async function tocarDias(alcances, session) {
  const unicos = new Map();

  for (const alcance of alcances) {
    const sede = alcance.sede || "TIENDITA";
    const fecha = diaCaja(alcance.fecha);

    unicos.set(
      claveDia(fecha, sede),
      { fecha, sede }
    );
  }

  if (!unicos.size) {
    throw errorCaja(
      409,
      "No se pudo determinar la fecha de la operación"
    );
  }

  const revisiones = new Map();

  const ordenados = [...unicos].sort(
    ([a], [b]) => a.localeCompare(b)
  );

  for (const [clave, { fecha, sede }] of ordenados) {
    const _id = controlId(fecha, sede);

    const anterior = await revisionDia(
      fecha,
      sede,
      session
    );

    await coleccionControl().updateOne(
      { _id },
      {
        $setOnInsert: {
          tipoRegistro: "CONTROL_DIA",
          fecha: new Date(`${fecha}T00:00:00.000Z`),
          sede
        },
        $inc: {
          revision: 1
        }
      },
      {
        upsert: true,
        session
      }
    );

    revisiones.set(clave, anterior);
  }

  return revisiones;
}
export async function confirmarTransaccion(session) {
  for (let intento = 0; ; intento++) {
    try {
      await session.commitTransaction();
      return;
    } catch (error) {
      // Reintentar únicamente la confirmación.
      // No ejecutar de nuevo el guardado completo.
      if (
        intento < 2 &&
        error.hasErrorLabel?.(
          "UnknownTransactionCommitResult"
        )
      ) {
        continue;
      }

      throw error;
    }
  }
}

export function traducirErrorTransaccion(error) {
  if (error.estado) return error;

  if (error.code === 20 || error.code === 303) {
    return errorCaja(
      503,
      "El bloqueo requiere que MongoDB admita " +
      "transacciones (replica set o Atlas). " +
      "No se guardó la operación."
    );
  }

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return errorCaja(
      503,
      "No se pudo confirmar el resultado. " +
      "Consulte el estado antes de volver a guardar."
    );
  }

  if (
    [112, 11000, 251].includes(error.code) ||
    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return errorCaja(
      409,
      "Hubo otra operación simultánea. " +
      "Actualice el reporte o la venta " +
      "y vuelva a intentarlo."
    );
  }

  return error;
}