import mongoose from "mongoose";

import {
  ConfiguracionHuevos,
  MovimientoHuevos,
  GrupoGallinas
} from "../models/Huevos.js";

import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";

import { fallo } from "./controlCaja.js";
import { comprobarMesHuevos } from "./periodoHuevos.js";

import {
  eventosHuevos,
  disponiblesDesde,
  repartirPreferente,
  unidadesCartones,
  dia
} from "./registroHuevos.mjs";

// CONFIGURACIÓN DEL MÓDULO
export async function configuracionHuevos(session) {
  return ConfiguracionHuevos
    .findById("HUEVOS")
    .session(session || null)
    .lean();
}

export function productoDeHuevos(config, sede) {
  return sede === "MONASTERIO"
    ? config.productoMonasterioId
    : config.productoTienditaId;
}

// COORDINAR OPERACIONES CONCURRENTES
export async function bloquearRegistroHuevos(session) {
  if (!session?.inTransaction()) {
    throw fallo(
      500,
      "Falta la transacción de huevos."
    );
  }

  return ConfiguracionHuevos.findOneAndUpdate(
    { _id: "HUEVOS" },
    { $inc: { revision: 1 } },
    {
      session,
      returnDocument: "after"
    }
  ).lean();
}

// CARGAR MOVIMIENTOS Y VENTAS ASIGNADAS
export async function cargarRegistroHuevos(
  session,
  excluirVenta
) {
  const movimientos = await MovimientoHuevos
    .find()
    .session(session)
    .lean();

  const filtro = {
    "asignacionesHuevos.0": { $exists: true }
  };

  if (excluirVenta) {
    const filtroSede = excluirVenta.sede === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    filtro.$nor = [
      {
        factura: excluirVenta.factura,
        ...filtroSede
      }
    ];
  }

  const vendidos = await Vendidos
    .find(filtro)
    .session(session)
    .lean();

  const grupos = await GrupoGallinas
    .find()
    .sort({ fechaInicio: 1, _id: 1 })
    .session(session)
    .lean();

  return {
    movimientos,
    vendidos,
    grupos,
    eventos: eventosHuevos(movimientos, vendidos)
  };
}

// EXISTENCIA GENERAL:
// STOCK INICIAL + ENTRADAS - SALIDAS - VENTAS
export async function stockGeneralHuevos(
  config,
  sede,
  session,
  excluirVenta
) {
  const productoId = productoDeHuevos(config, sede);

  const filtroSede = sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede },
          { sede: { $exists: false } }
        ]
      };

  const producto = await Producto
    .findOne({
      _id: productoId,
      ...filtroSede
    })
    .session(session)
    .lean();

  if (!producto) {
    throw fallo(
      409,
      "El producto de huevos configurado ya no existe en esta sede."
    );
  }

  const entradas = await Entrada
    .find({ productoId, ...filtroSede })
    .session(session)
    .lean();

  const salidas = await Salida
    .find({ productoId, ...filtroSede })
    .session(session)
    .lean();

  const filtroVendido = {
    productoId,
    ...filtroSede
  };

  if (excluirVenta?.sede === sede) {
    filtroVendido.factura = {
      $ne: excluirVenta.factura
    };
  }

  const vendidos = await Vendidos
    .find(filtroVendido)
    .session(session)
    .lean();

  const cantidad =
    Number(producto.stock || 0) +
    entradas.reduce((suma, entrada) => suma + entrada.cantidad, 0) -
    salidas.reduce((suma, salida) => suma + salida.cantidad, 0) -
    vendidos.reduce((suma, vendido) => suma + vendido.cantidad, 0);

  const unidades = Math.round(cantidad * 30);

  if (
    !Number.isFinite(cantidad) ||
    !Number.isSafeInteger(unidades) ||
    Math.abs(cantidad * 30 - unidades) > 0.00001 ||
    unidades < 0
  ) {
    throw fallo(
      409,
      "La existencia anterior de huevos necesita revisión: " +
      "debe representar huevos enteros y no ser negativa."
    );
  }

  return {
    producto,
    unidades
  };
}

// PREPARAR EL DESCUENTO DE HUEVOS EN UNA VENTA.
// Se ejecuta dentro de la transacción de la factura.
export async function prepararVentaHuevos({
  lineas,
  anteriores = [],
  factura,
  sede,
  fecha,
  fechaAnterior,
  session
}) {
  const config = await configuracionHuevos(session);

  if (!config) return;

  const productoId = String(
    productoDeHuevos(config, sede)
  );

  const nuevas = lineas.filter(
    (linea) => String(linea.productoId) === productoId
  );

  const anterioresHuevos = anteriores.filter(
    (linea) => String(linea.productoId) === productoId
  );

  if (!nuevas.length && !anterioresHuevos.length) {
    return;
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  if (fecha > hoy) {
    throw fallo(
      400,
      "No registre ventas futuras de huevos."
    );
  }

  await comprobarMesHuevos(
    fecha,
    sede,
    session
  );

  if (fechaAnterior && dia(fechaAnterior) !== fecha) {
    await comprobarMesHuevos(
      dia(fechaAnterior),
      sede,
      session
    );
  }

  // No inventar la procedencia de ventas antiguas.
  if (
    anterioresHuevos.length &&
    !anterioresHuevos.some(
      (linea) => linea.huevosUnidades !== undefined
    ) &&
    fechaAnterior
  ) {
    const cantidadAntes = anterioresHuevos.reduce(
      (suma, linea) => suma + linea.cantidad,
      0
    );

    const cantidadDespues = nuevas.reduce(
      (suma, linea) => suma + linea.cantidad,
      0
    );

    if (
      fecha !== dia(fechaAnterior) ||
      Math.abs(cantidadAntes - cantidadDespues) > 0.0000001
    ) {
      throw fallo(
        409,
        "Esta factura de huevos no tiene procedencia histórica por grupo. " +
        "No cambie su fecha ni su cantidad desde el nuevo módulo."
      );
    }

    return;
  }

  if (fecha < dia(config.fechaInicioControl)) {
    throw fallo(
      400,
      "No registre ventas nuevas de huevos anteriores a la activación del módulo."
    );
  }

  await bloquearRegistroHuevos(session);

  const excluirVenta =
    factura !== undefined && factura !== null
      ? { factura, sede }
      : null;

  const { grupos, eventos } = await cargarRegistroHuevos(
    session,
    excluirVenta
  );

  const general = await stockGeneralHuevos(
    config,
    sede,
    session,
    excluirVenta
  );

  let restantes = general.unidades;

  const saldoGruposActual = grupos.reduce(
    (suma, grupo) =>
      suma +
      eventos
        .filter(
          (evento) =>
            evento.sede === sede &&
            evento.grupoId === String(grupo._id)
        )
        .reduce(
          (acumulado, evento) =>
            acumulado + evento.unidades,
          0
        ),
    0
  );

  if (saldoGruposActual > general.unidades) {
    throw fallo(
      409,
      "La existencia general y el control por grupos requieren revisión."
    );
  }

  let sinGrupo = general.unidades - saldoGruposActual;

  let preferencias =
    fechaAnterior && dia(fechaAnterior) === fecha
      ? anterioresHuevos.flatMap(
          (linea) =>
            (linea.asignacionesHuevos || []).map(
              (asignacion) => ({
                grupoId: asignacion.grupoId || null,
                unidades: asignacion.unidades
              })
            )
        )
      : [];

  for (const linea of nuevas) {
    let unidades;

    try {
      unidades = unidadesCartones(linea.cantidad);
    } catch (error) {
      throw fallo(400, error.message);
    }

    if (unidades > restantes) {
      throw fallo(
        409,
        "No hay suficientes huevos para la factura completa."
      );
    }

    const candidatos = grupos
      .filter(
        (grupo) =>
          new Date(grupo.fechaInicio)
            .toISOString()
            .slice(0, 10) <= fecha
      )
      .map((grupo) => ({
        grupoId: grupo._id,
        disponibles: disponiblesDesde(
          eventos,
          sede,
          grupo._id,
          fecha
        )
      }));

    candidatos.push({
      grupoId: null,
      disponibles: sinGrupo
    });

    let asignaciones;

    try {
      const reparto = repartirPreferente(
        unidades,
        candidatos,
        preferencias
      );

      asignaciones = reparto.asignaciones;
      preferencias = reparto.preferenciasRestantes;
    } catch (error) {
      throw fallo(409, error.message);
    }

    linea.actividadProductiva = config.actividadProductiva;
    linea.origenProducto = "PRODUCCION_MONASTERIO";
    linea.huevosUnidades = unidades;

    linea.fechaVentaHuevos = new Date(
      `${fecha}T00:00:00.000Z`
    );

    linea.asignacionesHuevos = asignaciones;

    for (const asignacion of asignaciones) {
      if (!asignacion.grupoId) {
        sinGrupo -= asignacion.unidades;
      } else {
        eventos.push({
          grupoId: String(asignacion.grupoId),
          sede,
          fecha,
          unidades: -asignacion.unidades,
          referencia: "NUEVA_VENTA"
        });
      }
    }

    eventos.sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        b.unidades - a.unidades
    );

    restantes -= unidades;
  }
}

const identificador = (valor) =>
  String(valor?._id || valor || "").toLowerCase();

// PROTEGER ENTRADAS Y SALIDAS CONTROLADAS
export async function protegerMovimientoHuevos(
  req,
  res,
  next
) {
  try {
    if (
      !["POST", "PUT", "DELETE"].includes(req.method)
    ) {
      return next();
    }

    const config = await configuracionHuevos(
      req.cajaMongo
    );

    if (!config) return next();

    const ids = [
      config.productoMonasterioId,
      config.productoTienditaId
    ].map(identificador);

    const Modelo = req.baseUrl.includes("entradas")
      ? Entrada
      : Salida;

    const anterior =
      req.params.id &&
      mongoose.isValidObjectId(req.params.id)
        ? await Modelo
            .findById(req.params.id)
            .session(req.cajaMongo || null)
            .lean()
        : null;

    if (
      anterior?.movimientoHuevosId ||
      ids.includes(identificador(anterior?.productoId)) ||
      ids.includes(identificador(req.body?.productoId))
    ) {
      throw fallo(
        409,
        "Registre o corrija este movimiento desde el módulo de huevos."
      );
    }

    return next();
  } catch (error) {
    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo comprobar el movimiento de huevos."
    });
  }
}

// IMPEDIR VENTAS DE HUEVOS POR EL ENDPOINT ANTIGUO
export async function protegerVendidoHuevos(
  req,
  res,
  next
) {
  try {
    if (req.method === "GET") return next();

    const config = await configuracionHuevos(
      req.cajaMongo
    );

    const ids = config
      ? [
          config.productoMonasterioId,
          config.productoTienditaId
        ].map(identificador)
      : [];

    const idRuta =
      req.params.id ||
      req.path
        .split("/")
        .filter(Boolean)
        .find(
          (parte) => /^[a-f\d]{24}$/i.test(parte)
        );

    const anterior =
      idRuta && mongoose.isValidObjectId(idRuta)
        ? await Vendidos
            .findById(idRuta)
            .session(req.cajaMongo || null)
            .lean()
        : null;

    if (
      anterior?.huevosUnidades !== undefined ||
      ids.includes(identificador(req.body?.productoId)) ||
      ids.includes(identificador(anterior?.productoId))
    ) {
      throw fallo(
        409,
        "Los huevos se venden o corrigen mediante la operación completa de ventas."
      );
    }

    return next();
  } catch (error) {
    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo comprobar el detalle vendido."
    });
  }
}