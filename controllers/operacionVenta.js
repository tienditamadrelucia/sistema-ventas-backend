import mongoose from "mongoose";
import { createHash } from "node:crypto";

import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Producto from "../models/Producto.js";
import Tasas from "../models/dbTasas.js";
import Contador from "../models/Contador.js";

import {
  diaComercial,
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

const porSede = sede =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

const montos = [
  "efectivoP",
  "transferenciaP",
  "efectivoBs",
  "transferenciaBs",
  "puntoBs",
  "pagomovilBs",
  "efectivoD",
  "zelle"
];

const referencias = [
  "referenciaP",
  "bancoP",
  "referenciaTBs",
  "bancoTBs",
  "refPunto",
  "lotePunto",
  "referenciaPMBs",
  "bancoPMBs",
  "referenciaZ",
  "bancoZ"
];

const redondear = valor =>
  Math.round((valor + Number.EPSILON) * 100) / 100;

function numero(
  valor,
  nombre,
  minimo = 0,
  maximo = Infinity
) {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    throw fallo(400, `${nombre} inválido`);
  }

  return valor;
}

function prepararMoneda(datos, venta, operacion) {
  if (
    !datos ||
    typeof datos !== "object" ||
    Array.isArray(datos)
  ) {
    throw fallo(400, "Pago inválido");
  }

  if (
    diaComercial(datos.fecha) !== diaComercial(venta.fecha) ||
    datos.sede !== venta.sede
  ) {
    throw fallo(
      409,
      "El pago preparado corresponde a otra fecha o sede. " +
      "Confírmelo de nuevo."
    );
  }

  const salida = {
    fecha: venta.fecha,
    sede: venta.sede,
    factura: venta.factura,
    operacion,
    total: 0
  };

  for (const campo of montos) {
    const valor = datos[campo] ?? 0;

    if (operacion === "VUELTOS") {
      numero(valor, campo, -Infinity, 0);

      if (
        !["efectivoP", "efectivoBs", "efectivoD"].includes(campo) &&
        valor !== 0
      ) {
        throw fallo(400, "El vuelto solo admite efectivo");
      }
    } else {
      numero(valor, campo);
    }

    salida[campo] = valor;
  }

  for (const campo of referencias) {
    const valor = datos[campo] ?? "";

    if (!["string", "number"].includes(typeof valor)) {
      throw fallo(400, "Referencia inválida");
    }

    salida[campo] = String(valor);
  }

  if (operacion !== "VUELTOS") {
    if (
      salida.puntoBs > 0 &&
      (!salida.refPunto || !salida.lotePunto)
    ) {
      throw fallo(400, "Faltan referencia o lote del punto");
    }

    if (
      salida.transferenciaP > 0 &&
      (!salida.referenciaP || !salida.bancoP)
    ) {
      throw fallo(
        400,
        "Faltan referencia o banco de la transferencia COP"
      );
    }
  }

  return salida;
}

async function movimientoAnterior(
  id,
  venta,
  esVuelto,
  session
) {
  if (!id) return null;

  if (
    typeof id !== "string" ||
    !/^[a-f\d]{24}$/i.test(id)
  ) {
    throw fallo(400, "ID de pago inválido");
  }

  const movimiento = await Moneda.findById(id)
    .session(session);

  if (
    !movimiento ||
    Number(movimiento.factura) !== Number(venta.factura) ||
    (movimiento.sede || "TIENDITA") !== venta.sede ||
    (movimiento.operacion === "VUELTOS") !== esVuelto
  ) {
    throw fallo(
      409,
      "El pago o vuelto no pertenece a esta factura"
    );
  }

  return movimiento;
}

export async function guardarOperacionCompleta(req, res) {
  try {
    const session = req.cajaMongo;

    if (!session?.inTransaction()) {
      throw fallo(500, "Falta la protección transaccional");
    }

    const body = req.body || {};
    const datos = body.venta || {};

    if (
      typeof body.operacionId !== "string" ||
      !/^[a-f\d-]{36}$/i.test(body.operacionId)
    ) {
      throw fallo(400, "Identificador de operación inválido");
    }

    if (
      typeof body.sinPago !== "boolean" ||
      typeof body.modoCredito !== "boolean"
    ) {
      throw fallo(400, "Modalidad inválida");
    }

    const hash = createHash("sha256")
      .update(`${req.usuarioCaja._id}:${body.operacionId}`)
      .digest("hex");

    const nuevaId = new mongoose.Types.ObjectId(
      hash.slice(0, 24)
    );

    const id = body.ventaId || nuevaId;

    // Reconocer el mismo envío si se perdió su respuesta.
    const aplicada = await Ventas.collection.findOne(
      {
        _id: new mongoose.Types.ObjectId(id),
        ultimaOperacionId: body.operacionId,
        ultimaOperacionUsuario: req.usuarioCaja._id
      },
      { session }
    );

    if (aplicada) {
      return res.json({
        ok: true,
        factura: aplicada.factura,
        idVenta: aplicada._id,
        repetida: true
      });
    }

    let venta = body.ventaId
      ? await Ventas.findById(body.ventaId).session(session)
      : null;

    if (body.ventaId && !venta) {
      throw fallo(404, "Venta no encontrada");
    }

    if (
      venta &&
      (
        !Number.isInteger(body.versionVenta) ||
        body.versionVenta !== Number(venta.__v || 0)
      )
    ) {
      throw fallo(
        409,
        "La venta cambió desde que se consultó. " +
        "Vuelva a cargarla."
      );
    }

    const sede = datos.sede || "TIENDITA";

    if (
      venta &&
      (venta.sede || "TIENDITA") !== sede
    ) {
      throw fallo(
        400,
        "No se puede cambiar la sede de una factura"
      );
    }

    const fecha = new Date(
      `${diaComercial(datos.fecha)}T00:00:00.000Z`
    );

    if (
      typeof datos.cliente !== "string" ||
      !datos.cliente.trim() ||
      typeof datos.hora !== "string" ||
      !datos.hora.trim()
    ) {
      throw fallo(400, "Faltan cliente u hora");
    }

    const IVA = numero(datos.IVA, "IVA", 0, 100);

    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 1000
    ) {
      throw fallo(
        400,
        "La factura debe contener productos"
      );
    }

    const lineas = [];
    let subtotal = 0;

    for (const item of body.items) {
      if (
        !item ||
        typeof item.productoId !== "string" ||
        !/^[a-f\d]{24}$/i.test(item.productoId)
      ) {
        throw fallo(400, "Producto inválido");
      }

      const producto = await Producto.findById(
        item.productoId
      ).session(session);

      if (!producto) {
        throw fallo(404, "Producto no encontrado");
      }

      const cantidad = numero(
        item.cantidad,
        "Cantidad",
        Number.MIN_VALUE
      );

      const precio = numero(item.precio, "Precio");

      const dscto = numero(
        item.dscto ?? 0,
        "Descuento",
        0,
        100
      );

      const total =
        cantidad * precio * (1 - dscto / 100);

      if (!Number.isFinite(total)) {
        throw fallo(400, "Total de producto inválido");
      }

      if (
        Math.abs(
          numero(item.total, "Total de producto") - total
        ) > 0.02
      ) {
        throw fallo(
          409,
          "Cambió el total de un producto. Revise la factura."
        );
      }

      subtotal += total;

      // Conservar la actividad y las reglas de participación.
      const generaParticipacion =
        Boolean(producto.generaParticipacion);

      const beneficiarioParticipacion = generaParticipacion
        ? producto.beneficiarioParticipacion || "NINGUNO"
        : "NINGUNO";

      const tipoParticipacion = generaParticipacion
        ? producto.tipoParticipacion || "NINGUNA"
        : "NINGUNA";

      const valorParticipacion = generaParticipacion
        ? Number(producto.valorParticipacion || 0)
        : 0;

      let montoParticipacion = 0;

      if (tipoParticipacion === "PORCENTAJE") {
        montoParticipacion =
          total * valorParticipacion / 100;
      }

      if (tipoParticipacion === "MONTO_FIJO") {
        montoParticipacion =
          cantidad * valorParticipacion;
      }

      montoParticipacion = redondear(montoParticipacion);

      lineas.push({
        productoId: producto._id,
        cantidad,
        precio,
        dscto,
        total,
        sede,
        actividadProductiva:
          producto.actividadProductiva || null,
        generaParticipacion,
        beneficiarioParticipacion,
        tipoParticipacion,
        valorParticipacion,
        montoParticipacion
      });
    }

    const total = subtotal * (1 + IVA / 100);

    numero(total, "Total de factura", Number.MIN_VALUE);

    if (
      Math.abs(
        numero(datos.total, "Total enviado") - total
      ) > 0.02 ||
      Math.abs(
        numero(datos.subtotal, "Subtotal enviado") - subtotal
      ) > 0.02
    ) {
      throw fallo(
        409,
        "Los totales de la factura no coinciden"
      );
    }

    let factura = venta?.factura;

    if (!venta) {
      const contador = await Contador.findOneAndUpdate(
        {
          tipo: sede === "MONASTERIO"
            ? "FACTURA_MONASTERIO"
            : "FACTURA_TIENDITA"
        },
        {
          $inc: { valor: 1 }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session
        }
      );

      factura = contador.valor;

      const duplicada = await Ventas.findOne({
        factura,
        ...porSede(sede)
      }).session(session);

      if (duplicada) {
        throw fallo(
          409,
          "La numeración del contador necesita revisión. " +
          "No se guardó la operación."
        );
      }

      venta = new Ventas({
        _id: nuevaId
      });
    }

    const existente = !venta.isNew;

    venta.set({
      factura,
      cliente: datos.cliente,
      fecha,
      hora: datos.hora,
      subtotal,
      IVA,
      total,
      usuario: existente
        ? venta.usuario
        : req.usuarioCaja.nombre || req.usuarioCaja.usuario,
      estado: body.sinPago || body.modoCredito
        ? "CREDITO"
        : "CONTADO",
      sede,
      tipoMovimiento: "VENTA"
    });

    let pago = null;
    let vuelto = null;

    const pagosPrevios = existente
      ? await Moneda.find({
          factura,
          ...porSede(sede)
        }).session(session)
      : [];

    if (body.sinPago) {
      if (pagosPrevios.length) {
        throw fallo(
          409,
          "La factura ya tiene pagos. No puede guardarse " +
          "como factura sin pago."
        );
      }
    } else {
      if (
        !existente &&
        (body.idPago || body.idVuelto)
      ) {
        throw fallo(
          409,
          "Una venta nueva no puede reutilizar " +
          "pagos de otra factura"
        );
      }

      const pagoAnterior = await movimientoAnterior(
        body.idPago,
        venta,
        false,
        session
      );

      const vueltoAnterior = await movimientoAnterior(
        body.idVuelto,
        venta,
        true,
        session
      );

      const idsPermitidos = [
        String(body.idPago || ""),
        String(body.idVuelto || "")
      ];

      if (
        pagosPrevios.some(
          movimiento =>
            !idsPermitidos.includes(String(movimiento._id))
        )
      ) {
        throw fallo(
          409,
          "Hay otros movimientos en esta factura. " +
          "Revísela desde el módulo de créditos " +
          "antes de reemplazarla."
        );
      }

      const pagoDatos = prepararMoneda(
        body.pago,
        venta,
        body.modoCredito ? "ABONO DE CREDITO" : "VENTA"
      );

      const vueltoDatos = body.vuelto
        ? prepararMoneda(body.vuelto, venta, "VUELTOS")
        : null;

      const inicio = new Date(
        `${diaComercial(fecha)}T00:00:00.000Z`
      );

      const fin = new Date(
        inicio.getTime() + 86400000
      );

      const tasa = await Tasas.findOne({
        fecha: {
          $gte: inicio,
          $lt: fin
        },
        ...porSede(sede)
      }).session(session);

      if (
        !tasa ||
        !(Number(tasa.tasaP) > 0) ||
        !(Number(tasa.tasaD) > 0)
      ) {
        throw fallo(
          409,
          "No hay tasas válidas para el día de la venta"
        );
      }

      const aUSD = movimiento => {
        if (!movimiento) return 0;

        const dolares =
          Number(movimiento.efectivoD || 0) +
          Number(movimiento.zelle || 0);

        const pesos =
          Number(movimiento.efectivoP || 0) +
          Number(movimiento.transferenciaP || 0);

        const bolivares =
          Number(movimiento.efectivoBs || 0) +
          Number(movimiento.transferenciaBs || 0) +
          Number(movimiento.puntoBs || 0) +
          Number(movimiento.pagomovilBs || 0);

        return (
          dolares +
          pesos / Number(tasa.tasaP) +
          bolivares / Number(tasa.tasaD)
        );
      };

      const neto =
        aUSD(pagoDatos) + aUSD(vueltoDatos);

      if (
        !Number.isFinite(neto) ||
        neto <= 0 ||
        neto > total + 0.250001 ||
        (
          !body.modoCredito &&
          Math.abs(neto - total) > 0.250001
        )
      ) {
        throw fallo(
          409,
          "El pago neto no cuadra con la factura " +
          "y las tasas del día"
        );
      }

      pagoDatos.total = body.modoCredito
        ? neto
        : total;

      pago = pagoAnterior || new Moneda();
      pago.set(pagoDatos);

      await pago.save({ session });

      if (vueltoDatos) {
        vuelto = vueltoAnterior || new Moneda();
        vuelto.set(vueltoDatos);

        await vuelto.save({ session });
      } else if (vueltoAnterior) {
        await Moneda.deleteOne({
          _id: vueltoAnterior._id
        }).session(session);
      }
    }

    if (existente) {
      venta.increment();
    }

    await venta.save({ session });

    if (existente) {
      await Vendidos.deleteMany({
        factura,
        ...porSede(sede)
      }).session(session);
    }

    for (const linea of lineas) {
      await new Vendidos({
        ...linea,
        factura
      }).save({ session });
    }

    await Ventas.collection.updateOne(
      {
        _id: venta._id
      },
      {
        $set: {
          ultimaOperacionId: body.operacionId,
          ultimaOperacionUsuario: req.usuarioCaja._id
        }
      },
      { session }
    );

    return res.json({
      ok: true,
      factura,
      idVenta: venta._id,
      idPago: pago?._id || null,
      idVuelto: vuelto?._id || null,
      versionVenta: venta.__v || 0
    });
  } catch (error) {
    if (
      error.code === 112 ||
      error.code === 11000 ||
      error.hasErrorLabel?.("TransientTransactionError") ||
      error.name === "VersionError"
    ) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "La operación coincidió con otro cambio. " +
          "Actualice y vuelva a intentarlo."
      });
    }

    if (
      error.name === "ValidationError" ||
      error.name === "CastError"
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Los datos no cumplen el modelo " +
          "de ventas o pagos"
      });
    }

    return responderFallo(res, error);
  }
}