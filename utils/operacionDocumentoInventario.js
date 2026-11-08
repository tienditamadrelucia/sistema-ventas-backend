import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { fallo } from "./controlCaja.js";

function ordenar(valor) {
  if (Array.isArray(valor)) {
    return valor.map(ordenar);
  }

  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map(clave => [
          clave,
          ordenar(valor[clave])
        ])
    );
  }

  return valor;
}

const hash = texto =>
  createHash("sha256")
    .update(texto)
    .digest("hex");

// ==========================================
// REFERENCIA AUTOMÁTICA
// ==========================================
export async function siguienteReferenciaDocumento(
  tipo,
  session
) {
  if (!["ENTRADA", "SALIDA"].includes(tipo)) {
    throw fallo(400, "Tipo de documento inválido.");
  }

  if (!session?.inTransaction()) {
    throw fallo(
      500,
      "Falta la transacción del documento."
    );
  }

  const resultado = await mongoose.connection.db
    .collection("contadoresDocumentosInventario")
    .findOneAndUpdate(
      { _id: tipo },
      { $inc: { numero: 1 } },
      {
        upsert: true,
        returnDocument: "after",
        session
      }
    );

  const contador =
    resultado?.numero === undefined
      ? resultado?.value
      : resultado;

  const numero = contador?.numero;

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw fallo(
      500,
      "No se pudo generar la referencia."
    );
  }

  const prefijo =
    tipo === "ENTRADA" ? "ENT" : "SAL";

  return (
    `${prefijo}-` +
    String(numero).padStart(6, "0")
  );
}

// ==========================================
// GUARDADO COMPLETO Y CONTROL DE REINTENTOS
// ==========================================
export function operacionDocumento(accion) {
  return async (req, res) => {
    let session;
    let respuesta;

    try {
      const usuarioId = req.usuarioCaja?._id;

      if (!usuarioId) {
        throw fallo(401, "Debe iniciar sesión.");
      }

      const clave = req.body?.claveOperacion;

      if (
        typeof clave !== "string" ||
        !/^[a-zA-Z0-9_-]{16,100}$/.test(clave)
      ) {
        throw fallo(
          400,
          "Falta el identificador de la operación. " +
          "Actualice la pantalla."
        );
      }

      const operacionId = hash(
        `${usuarioId}:${clave}`
      );

      const firma = hash(
        JSON.stringify(
          ordenar({
            metodo: req.method,
            ruta: `${req.baseUrl}${req.path}`,
            datos: req.body
          })
        )
      );

      session =
        await mongoose.connection.startSession();

      await session.withTransaction(
        async () => {
          const operaciones = mongoose.connection.db
            .collection(
              "operacionesDocumentosInventario"
            );

          const anterior =
            await operaciones.findOne(
              { _id: operacionId },
              { session }
            );

          if (anterior) {
            if (anterior.firma !== firma) {
              throw fallo(
                409,
                "Esta solicitud ya fue utilizada " +
                "con otros datos. Consulte el " +
                "documento antes de continuar."
              );
            }

            respuesta = {
              ...anterior.respuesta,
              repetida: true
            };

            return;
          }

          respuesta = await accion(
            req,
            session,
            {
              claveOperacion: clave,
              firmaOperacion: firma
            }
          );

          if (!respuesta || respuesta.ok !== true) {
            throw fallo(
              500,
              "No se pudo completar el documento."
            );
          }

          await operaciones.insertOne(
            {
              _id: operacionId,
              usuarioId,
              firma,
              respuesta,
              fecha: new Date()
            },
            { session }
          );
        },
        {
          readConcern: {
            level: "snapshot"
          },
          writeConcern: {
            w: "majority"
          },
          readPreference: "primary"
        }
      );

      return res.json(respuesta);
    } catch (error) {
      console.error(
        "Error en documento de inventario:",
        error
      );

      const estado = error.estado || 500;

      const mensaje = error.estado
        ? error.message
        : (
            "No se pudo confirmar la operación. " +
            "Consulte el listado y reintente " +
            "conservando la misma solicitud."
          );

      return res.status(estado).json({
        ok: false,
        error: mensaje,
        mensaje
      });
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // Conservar el resultado ya confirmado.
        }
      }
    }
  };
}