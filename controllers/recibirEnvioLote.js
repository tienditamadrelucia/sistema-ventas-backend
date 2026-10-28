import mongoose from "mongoose";
import EnvioLote from "../models/EnvioLote.js";
import LoteCrianza from "../models/LoteCrianza.js";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import {
  comprobarAcceso,
  comprobarAbierta,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  validarFechaMovimientoLote
} from "./consumoLote.js";

function numero(valor) {
  return typeof valor === "number" ||
    (
      typeof valor === "string" &&
      valor.trim() !== ""
    )
      ? Number(valor)
      : NaN;
}

function normalizarRecepcion(detalles) {
  if (
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    detalles.length > 7
  ) {
    throw fallo(
      400,
      "Revise todos los productos del envío."
    );
  }

  const origenes = new Set();
  const destinos = new Set();

  return detalles.map((detalle) => {
    if (!detalle || typeof detalle !== "object") {
      throw fallo(400, "El detalle no es válido.");
    }

    const productoOrigenId = String(
      detalle.productoOrigenId || ""
    ).toLowerCase();

    const productoDestinoId = String(
      detalle.productoDestinoId || ""
    ).toLowerCase();

    if (
      ![productoOrigenId, productoDestinoId].every(
        (id) => /^[a-f0-9]{24}$/.test(id)
      ) ||
      origenes.has(productoOrigenId) ||
      destinos.has(productoDestinoId)
    ) {
      throw fallo(
        400,
        "Seleccione los productos correspondientes sin repetirlos."
      );
    }

    origenes.add(productoOrigenId);
    destinos.add(productoDestinoId);

    if (detalle.revisado !== true) {
      throw fallo(
        400,
        "Marque cada producto como revisado."
      );
    }

    const peso = numero(detalle.pesoRecibidoKg);
    const gramos = Math.round(peso * 1000);

    if (
      !Number.isFinite(peso) ||
      peso < 0 ||
      !Number.isSafeInteger(gramos) ||
      Math.abs(peso * 1000 - gramos) >= 0.000001
    ) {
      throw fallo(
        400,
        "El peso recibido debe ser cero o positivo y tener hasta tres decimales."
      );
    }

    const valor = detalle.presentacionesRecibidas;

    const presentacionesRecibidas =
      valor === undefined ||
      valor === null ||
      valor === ""
        ? null
        : numero(valor);

    if (
      presentacionesRecibidas !== null &&
      (
        !Number.isSafeInteger(presentacionesRecibidas) ||
        presentacionesRecibidas < 0
      )
    ) {
      throw fallo(
        400,
        "Las piezas o paquetes recibidos deben ser enteros, cero o mayores."
      );
    }

    return {
      productoOrigenId,
      productoDestinoId,
      pesoRecibidoKg: gramos / 1000,
      presentacionesRecibidas,
      revisado: true
    };
  }).sort((a, b) =>
    a.productoOrigenId.localeCompare(b.productoOrigenId)
  );
}

function firmaRecepcion(datos) {
  return JSON.stringify({
    fecha: diaComercial(datos.fechaRecepcion),
    observaciones: datos.observacionesRecepcion || "",
    motivoDiferencias: datos.motivoDiferencias || "",

    detalles: normalizarRecepcion(
      datos.detalles.map((detalle) => {
        const recibido = detalle.recepcion || detalle;

        return {
          productoOrigenId: detalle.productoOrigenId,
          productoDestinoId: recibido.productoDestinoId,
          pesoRecibidoKg: recibido.pesoRecibidoKg,
          presentacionesRecibidas:
            recibido.presentacionesRecibidas,
          revisado: recibido.revisado
        };
      })
    )
  });
}

// =====================================================
// CONFIRMAR RECEPCIÓN EN TIENDITA
// =====================================================
export async function registrarRecepcionEnvioLote(req, res) {
  let session;

  try {
    comprobarAcceso(req, "TIENDITA");

    const { envioId } = req.params;
    const datos = req.body || {};

    if (!/^[a-fA-F0-9]{24}$/.test(envioId || "")) {
      throw fallo(
        400,
        "El envío indicado no es válido."
      );
    }

    const dia = validarFechaMovimientoLote(datos.fecha);
    const versionEsperada = numero(datos.versionEsperada);

    if (
      !Number.isSafeInteger(versionEsperada) ||
      versionEsperada < 0
    ) {
      throw fallo(
        400,
        "Actualice la consulta del envío antes de recibirlo."
      );
    }

    if (
      typeof datos.claveOperacion !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(
        datos.claveOperacion
      )
    ) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const solicitud = {
      fechaRecepcion: new Date(`${dia}T00:00:00.000Z`),

      observacionesRecepcion:
        typeof datos.observaciones === "string"
          ? datos.observaciones.trim()
          : "",

      motivoDiferencias:
        typeof datos.motivoDiferencias === "string"
          ? datos.motivoDiferencias.trim()
          : "",

      detalles: normalizarRecepcion(datos.detalles)
    };

    if (
      solicitud.observacionesRecepcion.length > 2000 ||
      solicitud.motivoDiferencias.length > 2000
    ) {
      throw fallo(
        400,
        "Las observaciones o el motivo son demasiado largos."
      );
    }

    session = await mongoose.startSession();

    let guardado;
    let repetida = false;

    await session.withTransaction(async () => {
      repetida = false;

      let envio = await EnvioLote.findOne({
        _id: envioId,
        origen: "MONASTERIO",
        destino: "TIENDITA"
      }).session(session);

      if (!envio) {
        throw fallo(404, "El envío no existe.");
      }

      if (envio.estado !== "EN_TRANSITO") {
        if (
          envio.claveRecepcion !== datos.claveOperacion ||
          String(envio.recibidoPor) !==
            String(req.usuarioCaja._id) ||
          firmaRecepcion(envio) !== firmaRecepcion(solicitud)
        ) {
          throw fallo(
            409,
            "Este envío ya tiene una recepción confirmada. Revise su detalle."
          );
        }

        guardado = envio;
        repetida = true;
        return;
      }

      if ((envio.__v ?? 0) !== versionEsperada) {
        throw fallo(
          409,
          "El envío cambió. Actualice la consulta antes de confirmar."
        );
      }

      if (dia < diaComercial(envio.fechaEnvio)) {
        throw fallo(
          400,
          "La recepción no puede ser anterior al envío."
        );
      }

      const lote = await LoteCrianza.findOneAndUpdate(
        {
          _id: envio.loteId,
          sede: "MONASTERIO",
          especie: "POLLOS"
        },
        {
          $inc: { __v: 1 }
        },
        {
          returnDocument: "after",
          session
        }
      );

      if (!lote) {
        throw fallo(
          409,
          "El lote de origen requiere revisión."
        );
      }

      envio = await EnvioLote.findOneAndUpdate(
        {
          _id: envio._id,
          estado: "EN_TRANSITO",
          __v: versionEsperada
        },
        {
          $inc: { __v: 1 }
        },
        {
          returnDocument: "after",
          session
        }
      );

      if (!envio) {
        throw fallo(
          409,
          "Otro usuario modificó el envío. Actualice la consulta."
        );
      }

      await tocarDias(
        [{ fecha: dia, sede: "TIENDITA" }],
        session
      );

      await comprobarAbierta(
        dia,
        "TIENDITA",
        session
      );

      const inicioMes = new Date(
        `${dia.slice(0, 7)}-01T00:00:00.000Z`
      );

      const finMes = new Date(inicioMes);
      finMes.setUTCMonth(finMes.getUTCMonth() + 1);

      const periodo = {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ],
        cierre: "S",
        fecha: {
          $gte: inicioMes,
          $lt: finMes
        }
      };

      if (
        await Entrada.exists(periodo).session(session) ||
        await Salida.exists(periodo).session(session)
      ) {
        throw fallo(
          409,
          "El período tiene movimientos cerrados en Tiendita."
        );
      }

      if (
        solicitud.detalles.length !== envio.detalles.length
      ) {
        throw fallo(
          400,
          "Debe revisar todos los productos del envío."
        );
      }

      const entradas = [];
      let hayDiferencias = false;

      for (const original of envio.detalles) {
        const recibido = solicitud.detalles.find(
          (item) =>
            item.productoOrigenId ===
            String(original.productoOrigenId)
        );

        if (!recibido) {
          throw fallo(
            400,
            "Falta revisar un producto del envío."
          );
        }

        const enviados = Math.round(
          original.pesoEnviadoKg * 1000
        );

        const recibidos = Math.round(
          recibido.pesoRecibidoKg * 1000
        );

        if (
          !Number.isSafeInteger(enviados) ||
          enviados <= 0
        ) {
          throw fallo(
            409,
            "Las cantidades enviadas requieren revisión."
          );
        }

        if (recibidos > enviados) {
          throw fallo(
            409,
            `El peso recibido de ${original.descripcionOrigen} supera lo enviado. Verifique el envío antes de confirmar.`
          );
        }

        if (original.presentacion === "SOLO_PESO") {
          if (recibido.presentacionesRecibidas !== null) {
            throw fallo(
              400,
              "Este producto se recibe únicamente por kilos."
            );
          }
        } else {
          const cantidad =
            recibido.presentacionesRecibidas;

          if (
            !Number.isSafeInteger(cantidad) ||
            cantidad < 0 ||
            cantidad > original.presentacionesEnviadas
          ) {
            throw fallo(
              409,
              `Revise las piezas o paquetes recibidos de ${original.descripcionOrigen}.`
            );
          }

          if (
            (recibidos === 0) !== (cantidad === 0)
          ) {
            throw fallo(
              400,
              "Los kilos y las piezas o paquetes recibidos deben corresponder."
            );
          }
        }

        const producto = await Producto.findOne({
          _id: recibido.productoDestinoId,
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        }).session(session);

        if (
          !producto ||
          !producto.descripcion ||
          !Number.isFinite(producto.codigo)
        ) {
          throw fallo(
            400,
            "Seleccione el producto correspondiente del catálogo de Tiendita."
          );
        }

        if (producto.origen !== "PRODUCCION_MONASTERIO") {
          throw fallo(
            400,
            `El producto ${producto.descripcion} debe tener origen PRODUCCIÓN DEL MONASTERIO. Revíselo en Productos.`
          );
        }

        const entradaId = recibidos > 0
          ? new mongoose.Types.ObjectId()
          : null;

        original.recepcion = {
          productoDestinoId: producto._id,
          codigoDestino: producto.codigo,
          descripcionDestino: producto.descripcion,
          pesoRecibidoKg: recibido.pesoRecibidoKg,
          presentacionesRecibidas:
            recibido.presentacionesRecibidas,
          revisado: true,
          entradaId
        };

        if (
          recibidos !== enviados ||
          recibido.presentacionesRecibidas !==
            original.presentacionesEnviadas
        ) {
          hayDiferencias = true;
        }

        if (entradaId) {
          entradas.push({
            _id: entradaId,
            fecha: solicitud.fechaRecepcion,
            categoria: producto.categoria,
            productoId: producto._id,
            codigo: producto.codigo,
            cantidad: recibido.pesoRecibidoKg,
            observacion:
              "RECEPCIÓN DEL MONASTERIO DEL LOTE",
            sede: "TIENDITA",
            cierre: "N",
            loteId: envio.loteId,
            envioId: envio._id,
            presentacionProduccion: original.presentacion,
            cantidadPresentaciones:
              recibido.presentacionesRecibidas
          });
        }
      }

      if (
        hayDiferencias &&
        !solicitud.motivoDiferencias
      ) {
        throw fallo(
          400,
          "Indique el motivo de las diferencias antes de confirmar."
        );
      }

      envio.fechaRecepcion = solicitud.fechaRecepcion;
      envio.recibidoPor = req.usuarioCaja._id;
      envio.claveRecepcion = datos.claveOperacion;
      envio.observacionesRecepcion =
        solicitud.observacionesRecepcion;
      envio.motivoDiferencias =
        solicitud.motivoDiferencias;
      envio.diferenciasPendientes = hayDiferencias;
      envio.estado = hayDiferencias
        ? "RECIBIDO_CON_DIFERENCIAS"
        : "RECIBIDO";

      if (entradas.length > 0) {
        await Entrada.create(entradas, {
          session,
          ordered: true
        });
      }

      await envio.save({ session });
      guardado = envio;
    });

    return res.json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Esta recepción ya estaba registrada."
        : guardado.diferenciasPendientes
          ? "Recepción registrada con diferencias pendientes de revisión."
          : "Recepción y entradas registradas correctamente.",
      envio: guardado
    });
  } catch (error) {
    console.error("Error recibiendo envío:", error);

    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo confirmar la recepción. Conserve la solicitud para reintentar."
    });
  } finally {
    if (session) await session.endSession();
  }
}