import mongoose from "mongoose";
import { createHash } from "node:crypto";

import Gastos from "../models/dbGastos.js";
import Entrada from "../models/Entrada.js";
import Producto from "../models/Producto.js";
import Salidas from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import {
  comprobarAcceso,
  diaComercial,
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

const porSede = (sede) =>
  sede === "MONASTERIO"
    ? { sede: "MONASTERIO" }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

const redondear = (numero, decimales = 6) => {
  const factor = 10 ** decimales;
  return Math.round((numero + Number.EPSILON) * factor) / factor;
};

function numeroPositivo(valor, nombre) {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor <= 0
  ) {
    throw fallo(400, `${nombre} debe ser un número mayor que cero.`);
  }

  return valor;
}

async function sumarCantidades(Modelo, productoId, sede, session) {
  const filas = await Modelo.aggregate([
    {
      $match: {
        productoId,
        ...porSede(sede)
      }
    },
    {
      $group: {
        _id: null,
        cantidad: { $sum: "$cantidad" }
      }
    }
  ]).session(session);

  return Number(filas[0]?.cantidad || 0);
}

function firmaCompra(datos) {
  return JSON.stringify({
    fecha: diaComercial(datos.fecha),
    sede: datos.sede,
    descripcion: datos.descripcion,
    moneda: datos.moneda,
    numeroRecibo: datos.numeroRecibo || "",
    cajaChica: datos.cajaChica,
    tasaCambio: datos.tasaCambio,
    detalles: datos.detalles
      .map((detalle) => ({
        productoId: String(detalle.productoId),
        cantidad: detalle.cantidad,
        costoUnitarioMoneda: detalle.costoUnitarioMoneda
      }))
      .sort((a, b) => a.productoId.localeCompare(b.productoId))
  });
}

async function comprobarFechaCompra(
  productoId,
  fecha,
  sede,
  session
) {
  const finDia = new Date(fecha);
  finDia.setUTCDate(finDia.getUTCDate() + 1);

  const filtro = {
    productoId,
    fecha: { $gte: finDia },
    ...porSede(sede)
  };

  const entradaPosterior = await Entrada.exists(filtro)
    .session(session);

  const salidaPosterior = await Salidas.exists(filtro)
    .session(session);

  if (entradaPosterior || salidaPosterior) {
    throw fallo(
      409,
      "Este producto tiene entradas o salidas posteriores a la fecha de compra. No se puede recalcular su costo sin revisar esos movimientos."
    );
  }

  // Los detalles vendidos pueden no tener fecha propia.
  // Consultamos la fecha de su factura.
  const ventasPosteriores = await Vendidos.aggregate([
    {
      $match: {
        productoId,
        ...porSede(sede)
      }
    },
    {
      $lookup: {
        from: Ventas.collection.name,
        let: {
          numeroFactura: "$factura"
        },
        pipeline: [
          {
            $match: {
              fecha: { $gte: finDia },
              ...porSede(sede),
              $expr: {
                $eq: ["$factura", "$$numeroFactura"]
              }
            }
          }
        ],
        as: "facturasPosteriores"
      }
    },
    {
      $match: {
        "facturasPosteriores.0": { $exists: true }
      }
    },
    {
      $limit: 1
    }
  ]).session(session);

  if (ventasPosteriores.length > 0) {
    throw fallo(
      409,
      "Este producto tiene ventas posteriores a la fecha de compra. No se puede recalcular su costo sin revisar esas ventas."
    );
  }
}

export async function guardarCompraReventa(req, res) {
  try {
    const session = req.cajaMongo;

    if (!session?.inTransaction()) {
      throw fallo(500, "Falta la protección transaccional de la compra.");
    }

    const body = req.body || {};
    const sede = body.sede;

    comprobarAcceso(req, sede);

    const rol = req.usuarioCaja?.rol;

    if (!["ADMINISTRADOR", "SUPERVISOR"].includes(rol)) {
      throw fallo(403, "No tiene permiso para registrar compras.");
    }

    if (
      typeof body.claveOperacion !== "string" ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
        body.claveOperacion
      )
    ) {
      throw fallo(400, "Identificador de compra inválido.");
    }

    const fechaTexto = diaComercial(body.fecha);
    const fecha = new Date(`${fechaTexto}T00:00:00.000Z`);

        const partesHoy = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const parte = (tipo) =>
      partesHoy.find((elemento) => elemento.type === tipo).value;

    const hoy =
      `${parte("year")}-${parte("month")}-${parte("day")}`;

    if (fechaTexto > hoy) {
      throw fallo(
        400,
        "La fecha de compra no puede ser posterior a hoy."
      );
    }

    if (!["D", "P", "Bs"].includes(body.moneda)) {
      throw fallo(400, "Moneda de compra inválida.");
    }

    const tasaCambio =
      body.moneda === "D"
        ? 1
        : numeroPositivo(body.tasaCambio, "La tasa de cambio");

    if (
      typeof body.descripcion !== "string" ||
      !body.descripcion.trim()
    ) {
      throw fallo(400, "Seleccione la descripción del gasto.");
    }

    if (typeof body.cajaChica !== "boolean") {
      throw fallo(400, "Debe indicar si la compra salió de caja chica.");
    }

    if (
      !Array.isArray(body.detalles) ||
      body.detalles.length === 0 ||
      body.detalles.length > 200
    ) {
      throw fallo(400, "La compra debe contener entre 1 y 200 productos.");
    }

    const ids = new Set();

    const detallesSolicitados = body.detalles.map((detalle) => {
      if (
        !detalle ||
        typeof detalle.productoId !== "string" ||
        !/^[a-f\d]{24}$/i.test(detalle.productoId)
      ) {
        throw fallo(400, "Hay un producto inválido en la compra.");
      }

      const productoId = detalle.productoId.toLowerCase();

      if (ids.has(productoId)) {
        throw fallo(
          400,
          "El mismo producto no puede aparecer dos veces en la compra."
        );
      }

      ids.add(productoId);

      const cantidad = numeroPositivo(detalle.cantidad, "La cantidad");
      const costo = numeroPositivo(
        detalle.costoUnitarioMoneda,
        "El costo unitario"
      );

      if (redondear(cantidad, 3) !== cantidad) {
        throw fallo(400, "La cantidad admite hasta tres decimales.");
      }

      if (redondear(costo, 6) !== costo) {
        throw fallo(400, "El costo admite hasta seis decimales.");
      }

      return {
        productoId,
        cantidad,
        costoUnitarioMoneda: costo
      };
    });

    const numeroRecibo =
      body.numeroRecibo === undefined ||
      body.numeroRecibo === null ||
      String(body.numeroRecibo).trim() === "0"
        ? ""
        : String(body.numeroRecibo).trim();

    const solicitud = {
      fecha,
      sede,
      descripcion: body.descripcion.trim(),
      moneda: body.moneda,
      numeroRecibo,
      cajaChica: body.cajaChica,
      tasaCambio,
      detalles: detallesSolicitados
    };

    // La misma operación genera siempre el mismo ID.
    const hash = createHash("sha256")
      .update(
        `compra:${req.usuarioCaja._id}:${sede}:${body.claveOperacion}`
      )
      .digest("hex");

    const gastoId = new mongoose.Types.ObjectId(hash.slice(0, 24));

    const existente = await Gastos.findById(gastoId)
      .session(session)
      .lean();

    if (existente) {
      if (!existente.compraReventa) {
        throw fallo(409, "El identificador ya pertenece a otro registro.");
      }

      const firmaExistente = firmaCompra({
        ...existente,
        tasaCambio: existente.compraReventa.tasaCambio,
        detalles: existente.compraReventa.detalles
      });

      if (firmaExistente !== firmaCompra(solicitud)) {
        throw fallo(
          409,
          "Esta operación ya se guardó con otros datos. Consulte la compra."
        );
      }

      return res.json({
        ok: true,
        repetida: true,
        gasto: existente
      });
    }

    // No añadir compras a un mes que ya tiene gastos
    // o entradas marcados como cerrados.
    const inicioMes = new Date(fecha);
    inicioMes.setUTCDate(1);

    const finMes = new Date(inicioMes);
    finMes.setUTCMonth(finMes.getUTCMonth() + 1);

    const filtroMesCerrado = {
      fecha: { $gte: inicioMes, $lt: finMes },
      cierre: "S",
      ...porSede(sede)
    };

    const gastoCerrado = await Gastos.exists(filtroMesCerrado)
      .session(session);

    const entradaCerrada = await Entrada.exists(filtroMesCerrado)
      .session(session);

    if (gastoCerrado || entradaCerrada) {
      throw fallo(409, "No puede registrar compras en un mes cerrado.");
    }

    if (numeroRecibo) {
      const reciboExistente = await Gastos.exists({
        numeroRecibo,
        cierre: { $ne: "S" },
        ...porSede(sede)
      }).session(session);

      if (reciboExistente) {
        throw fallo(409, "Ya existe un gasto abierto con ese recibo.");
      }
    }

    const detalles = [];
    const entradasNuevas = [];

    let totalMoneda = 0;
    let totalUSD = 0;

    for (const linea of detallesSolicitados) {
      const producto = await Producto.findOne({
        _id: linea.productoId,
        ...porSede(sede)
      }).session(session);

      if (!producto) {
        throw fallo(404, "Uno de los productos no pertenece a esta sede.");
      }

      if (producto.origen !== "COMPRADO") {
        throw fallo(
          400,
          `${producto.descripcion}: solo se admiten productos comprados para reventa.`
        );
      }

      await comprobarFechaCompra(
        producto._id,
        fecha,
        sede,
        session
      );

      const entradas = await sumarCantidades(
        Entrada,
        producto._id,
        sede,
        session
      );

      const salidas = await sumarCantidades(
        Salidas,
        producto._id,
        sede,
        session
      );

      const vendidos = await sumarCantidades(
        Vendidos,
        producto._id,
        sede,
        session
      );

      const existencias = redondear(
        Number(producto.stock || 0) + entradas - salidas - vendidos,
        3
      );

      const costoAnterior = Number(producto.costo);

      if (!Number.isFinite(existencias) || existencias < 0) {
        throw fallo(
          409,
          `${producto.descripcion}: revise sus existencias antes de calcular el costo promedio.`
        );
      }

      if (
        existencias > 0 &&
        (!Number.isFinite(costoAnterior) || costoAnterior <= 0)
      ) {
        throw fallo(
          409,
          `${producto.descripcion}: debe confirmar el costo de las existencias anteriores.`
        );
      }

      const subtotalMoneda = redondear(
        linea.cantidad * linea.costoUnitarioMoneda,
        2
      );

      if (subtotalMoneda <= 0) {
        throw fallo(400, "El importe de cada producto debe ser mayor que cero.");
      }

      const subtotalUSD = redondear(subtotalMoneda / tasaCambio);

      if (subtotalUSD <= 0) {
        throw fallo(400, "El equivalente en dólares es demasiado pequeño.");
      }

      const costoUnitarioUSD = redondear(
        subtotalUSD / linea.cantidad
      );

            if (
        !Number.isFinite(costoUnitarioUSD) ||
        costoUnitarioUSD <= 0
      ) {
        throw fallo(
          400,
          "El costo unitario en dólares es demasiado pequeño. Revise la cantidad y la tasa."
        );
      }
      
      const costoPromedio = redondear(
        (
          existencias * (existencias > 0 ? costoAnterior : 0) +
          subtotalUSD
        ) /
        (existencias + linea.cantidad)
      );

      const entradaId = new mongoose.Types.ObjectId();

      detalles.push({
        productoId: producto._id,
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        actividadProductiva: producto.actividadProductiva || null,
        cantidad: linea.cantidad,
        costoUnitarioMoneda: linea.costoUnitarioMoneda,
        subtotalMoneda,
        costoUnitarioUSD,
        subtotalUSD,
        entradaId
      });

      entradasNuevas.push({
        _id: entradaId,
        fecha,
        sede,
        categoria: producto.categoria,
        productoId: producto._id,
        codigo: producto.codigo,
        cantidad: linea.cantidad,
        observacion: "COMPRAS",
        precioCompra: costoUnitarioUSD,
        precioVenta: producto.venta,
        gastoId,
        monedaCompra: body.moneda,
        costoUnitarioMoneda: linea.costoUnitarioMoneda,
        tasaCambioCompra: tasaCambio,
        cierre: "N"
      });

      // No cambia el stock inicial ni el precio de venta.
      producto.costo = costoPromedio;
      await producto.save({ session });

      totalMoneda += subtotalMoneda;
      totalUSD += subtotalUSD;
    }

    const [gasto] = await Gastos.create(
      [
        {
          _id: gastoId,
          fecha,
          sede,
          descripcion: solicitud.descripcion,
          clasificacion: "COMPRA_REVENTA",
          actividadProductiva: null,
          moneda: body.moneda,
          monto: redondear(totalMoneda, 2),
          numeroRecibo: numeroRecibo || null,
          cajaChica: body.cajaChica,
          usuario: String(req.usuarioCaja._id),
          cierre: "N",
          compraReventa: {
            claveOperacion: body.claveOperacion,
            tasaCambio,
            totalUSD: redondear(totalUSD),
            detalles
          }
        }
      ],
      { session }
    );

    await Entrada.insertMany(entradasNuevas, { session });

    return res.json({
      ok: true,
      repetida: false,
      gasto
    });
  } catch (error) {
    return responderFallo(res, error);
  }
}