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
import {
  calcularImportesCompra,
  normalizarCargos
} from "../utils/calculoCompraReventa.js";

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
    cargos: normalizarCargos(datos.cargos),

    detalles: datos.detalles
      .map((detalle) => ({
        productoId: String(detalle.productoId),
        cantidad: detalle.cantidad,
        costoUnitarioMoneda: detalle.costoUnitarioMoneda
      }))
      .sort((a, b) =>
        a.productoId.localeCompare(b.productoId)
      )
  });
}

async function comprobarFechaCompra(
  productoId,
  fecha,
  sede,
  session,
  rol
) {
  const finDia = new Date(fecha);
  finDia.setUTCDate(finDia.getUTCDate() + 1);

  const filtro = {
    productoId,
    fecha: { $gte: finDia },
    ...porSede(sede)
  };

  const entradaPosterior = await Entrada
    .exists(filtro)
    .session(session);

  const salidaPosterior = await Salidas
    .exists(filtro)
    .session(session);

  if (entradaPosterior || salidaPosterior) {
    throw fallo(
      409,
      "Este producto tiene entradas o salidas " +
      "posteriores a la fecha de compra. " +
      "Debe revisar esos movimientos antes " +
      "de regularizar su costo."
    );
  }

  const filas = await Vendidos.aggregate([
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
              ...porSede(sede),

              $expr: {
                $eq: [
                  "$factura",
                  "$$numeroFactura"
                ]
              }
            }
          },
          {
            $project: {
              fecha: 1
            }
          }
        ],

        as: "cabeceras"
      }
    },
    {
      $project: {
        cantidad: 1,
        factura: 1,
        cabeceras: 1
      }
    }
  ]).session(session);

  const posteriores = filas.filter(fila =>
    fila.cabeceras.some(
      venta =>
        new Date(venta.fecha) >= finDia
    )
  );

  if (!posteriores.length) {
    return 0;
  }

  if (rol !== "ADMINISTRADOR") {
    throw fallo(
      409,
      "Este producto tiene ventas posteriores " +
      "a la fecha de compra. La regularización " +
      "corresponde a la administradora."
    );
  }

  // No reconstruir cantidades con facturas
  // faltantes, duplicadas o inválidas.
  for (const fila of filas) {
    if (
      fila.cabeceras.length !== 1 ||
      !Number.isFinite(
        new Date(
          fila.cabeceras[0].fecha
        ).getTime()
      ) ||
      typeof fila.cantidad !== "number" ||
      !Number.isFinite(fila.cantidad) ||
      fila.cantidad <= 0
    ) {
      throw fallo(
        409,
        "Hay ventas sin una factura única y válida. " +
        "Debe revisarlas antes de regularizar la compra."
      );
    }

    const fechaVenta = new Date(
      fila.cabeceras[0].fecha
    );

    if (
      fechaVenta >= fecha &&
      fechaVenta < finDia
    ) {
      throw fallo(
        409,
        "Hay ventas del mismo día de la compra. " +
        "Debe confirmar el orden de esos movimientos " +
        "antes de recalcular el costo."
      );
    }
  }

  const filtroMismoDia = {
    productoId,

    fecha: {
      $gte: fecha,
      $lt: finDia
    },

    ...porSede(sede)
  };

  const entradaMismoDia = await Entrada
    .exists(filtroMismoDia)
    .session(session);

  const salidaMismoDia = await Salidas
    .exists(filtroMismoDia)
    .session(session);

  if (entradaMismoDia || salidaMismoDia) {
    throw fallo(
      409,
      "Hay otras entradas o salidas del mismo " +
      "día de la compra. Revise su orden antes " +
      "de regularizar el costo."
    );
  }

  const cantidadPosterior = posteriores.reduce(
    (suma, fila) =>
      suma + fila.cantidad,
    0
  );

  if (
    !Number.isFinite(cantidadPosterior) ||
    cantidadPosterior <= 0
  ) {
    throw fallo(
      409,
      "No se pudo comprobar la cantidad " +
      "vendida después de la compra."
    );
  }

  return redondear(cantidadPosterior, 3);
}

function calcularPromedioCompra(
  existencias,
  vendidosPosteriores,
  cantidadCompra,
  costoAnterior,
  costoTotalUSD
) {
  // Recuperar las unidades vendidas después
  // para calcular el promedio desde la compra.
  const base = redondear(
    existencias + vendidosPosteriores,
    3
  );

  const saldoFinal = redondear(
    existencias + cantidadCompra,
    3
  );

  if (
    !Number.isFinite(base) ||
    base < 0 ||
    !Number.isFinite(saldoFinal) ||
    saldoFinal < 0
  ) {
    throw fallo(
      409,
      "Revise las existencias: la compra no " +
      "corrige los saldos negativos del producto."
    );
  }

  if (
    base > 0 &&
    (
      !Number.isFinite(costoAnterior) ||
      costoAnterior <= 0
    )
  ) {
    throw fallo(
      409,
      "Debe confirmar el costo de las " +
      "existencias anteriores a la compra."
    );
  }

  const promedio = redondear(
    (
      base *
        (base > 0 ? costoAnterior : 0) +
      costoTotalUSD
    ) /
    (base + cantidadCompra)
  );

  if (
    !Number.isFinite(promedio) ||
    promedio <= 0
  ) {
    throw fallo(
      409,
      "No se pudo calcular un costo promedio válido."
    );
  }

  return promedio;
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

    const cargosSolicitados = normalizarCargos(body.cargos);

const calculoCompra = calcularImportesCompra(
  detallesSolicitados,
  cargosSolicitados
);

const solicitud = {
  fecha,
  sede,
  descripcion: body.descripcion.trim(),
  moneda: body.moneda,
  numeroRecibo,
  cajaChica: body.cajaChica,
  tasaCambio,
  detalles: detallesSolicitados,
  cargos: cargosSolicitados
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
        detalles: existente.compraReventa.detalles,
        cargos: existente.compraReventa.cargos || []
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

    let totalUSD = 0;
    let totalCostoUSD = 0;

    for (const linea of calculoCompra.detalles) {
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

            const vendidosPosteriores =
        await comprobarFechaCompra(
          producto._id,
          fecha,
          sede,
          session,
          rol
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

      const subtotalMoneda = linea.subtotalMoneda;

const costoTotalMoneda = linea.costoTotalMoneda;

// Importe pagado por este producto, incluidos todos los cargos.
const subtotalUSD = redondear(
  subtotalMoneda / tasaCambio
);

// Importe que realmente se incorpora al inventario.
const costoTotalUSD = redondear(
  costoTotalMoneda / tasaCambio
);

const costoUnitarioUSD = redondear(
  costoTotalUSD / linea.cantidad
);

if (
  !Number.isFinite(subtotalUSD) ||
  subtotalUSD <= 0 ||
  !Number.isFinite(costoTotalUSD) ||
  costoTotalUSD <= 0 ||
  !Number.isFinite(costoUnitarioUSD) ||
  costoUnitarioUSD <= 0
) {
  throw fallo(
    400,
    "El equivalente en dólares es inválido o demasiado pequeño. Revise los importes y la tasa."
  );
}

// El promedio incluye únicamente los cargos
// marcados para incorporarse al costo.
const costoPromedio = calcularPromedioCompra(
  existencias,
  vendidosPosteriores,
  linea.cantidad,
  costoAnterior,
  costoTotalUSD
);

// Registrar la regularización sin cambiar
// los costos históricos de las ventas.
if (vendidosPosteriores > 0) {
  await mongoose.connection.db
    .collection("regularizacionesCompras")
    .insertOne(
      {
        gastoId,
        productoId: producto._id,
        sede,

        fechaCompra: fecha,
        registradoEl: new Date(),
        registradoPor: req.usuarioCaja._id,

        cantidadCompra: linea.cantidad,

        cantidadVendidaPosterior:
          vendidosPosteriores,

        existenciaAntesDeRegistrar:
          existencias,

        existenciaAnteriorALaCompra:
          redondear(
            existencias + vendidosPosteriores,
            3
          ),

        costoAnterior,
        costoCompraUSD: costoTotalUSD,
        costoPromedioNuevo: costoPromedio,

        tratamientoVentas:
          "Se conservan los costos históricos " +
          "registrados; no se recalculan " +
          "utilidades pasadas."
      },
      { session }
    );
}

      const entradaId = new mongoose.Types.ObjectId();

      detalles.push({
      productoId: producto._id,
      codigo: producto.codigo,
      descripcion: producto.descripcion,
      actividadProductiva: producto.actividadProductiva || null,
      cantidad: linea.cantidad,

      // Precio original, antes de cargos.
      costoUnitarioMoneda: linea.costoUnitarioMoneda,

      subtotalBaseMoneda: linea.subtotalBaseMoneda,
      cargosCostoMoneda: linea.cargosCostoMoneda,
      cargosNoCostoMoneda: linea.cargosNoCostoMoneda,

      // Total pagado: permite distribuir el gasto por actividad.
      subtotalMoneda,
      subtotalUSD,

      // Costo final del inventario.
      costoTotalMoneda,
      costoTotalUSD,
      costoUnitarioUSD,

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

      totalUSD += subtotalUSD;
      totalCostoUSD += costoTotalUSD;
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
          monto: calculoCompra.totalMoneda,
          numeroRecibo: numeroRecibo || null,
          cajaChica: body.cajaChica,
          usuario: String(req.usuarioCaja._id),
          cierre: "N",
          compraReventa: {
            claveOperacion: body.claveOperacion,
            tasaCambio,

            subtotalProductosMoneda:
            calculoCompra.subtotalProductosMoneda,

            totalCargosMoneda:
            calculoCompra.totalCargosMoneda,

            cargosCostoMoneda:
            calculoCompra.cargosCostoMoneda,

            cargosNoCostoMoneda:
            calculoCompra.cargosNoCostoMoneda,

            totalUSD: redondear(totalUSD),
            totalCostoUSD: redondear(totalCostoUSD),

            cargos: calculoCompra.cargos,
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