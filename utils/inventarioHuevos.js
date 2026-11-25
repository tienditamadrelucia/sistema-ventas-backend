import mongoose from "mongoose";
import Ventas from "../models/dbVentas.js";
import {
  ConfiguracionHuevos,
  MovimientoHuevos,
  GrupoGallinas
} from "../models/Huevos.js";

import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";
import { saldoInventario } from "./saldoInventario.js";
import {
  fallo,
  protegerEscrituras,
  comprobarAcceso
} from "./controlCaja.js";

import {
  comprobarMesHuevos,
  comprobarDiaHuevos
} from "./periodoHuevos.js";

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
    "asignacionesHuevos.0": { $exists: true },
    descuentaInventario: { $ne: false }
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

  const detalles = await Vendidos.find(filtro)
  .session(session || null).lean();

const facturas = [...new Set(detalles.map(v => v.factura))];
const cabeceras = await Ventas.find({
  factura: { $in: facturas }
}).select("factura sede fecha estado tipoMovimiento")
  .session(session || null).lean();

const mapaCabeceras = new Map();

for (const venta of cabeceras) {
  const clave = `${venta.sede || "TIENDITA"}:${venta.factura}`;
  if (!mapaCabeceras.has(clave)) mapaCabeceras.set(clave, []);
  mapaCabeceras.get(clave).push(venta);
}

const vendidos = detalles.filter(detalle => {
  const clave = `${detalle.sede || "TIENDITA"}:${detalle.factura}`;
  const coincidencias = mapaCabeceras.get(clave) || [];

  if (coincidencias.length !== 1) {
    throw fallo(409,
      `Factura ${detalle.factura} de ${detalle.sede || "TIENDITA"}: requiere revisión de su cabecera.`);
  }

  const venta = coincidencias[0];

  if (!venta.fecha || !Number.isFinite(new Date(venta.fecha).getTime())) {
    throw fallo(409, `Factura ${detalle.factura}: fecha inválida.`);
  }

  return venta.estado !== "CREDITO" &&
    venta.tipoMovimiento !== "OTRO_INGRESO";
});

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
  excluirVenta,
  opciones = {}
) {
  const productoId = productoDeHuevos(
    config,
    sede
  );

  const filtroSede =
    sede === "MONASTERIO"
      ? { sede }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

  const producto = await Producto.findOne({
    _id: productoId,
    ...filtroSede
  })
    .session(session || null)
    .lean();

  if (!producto) {
    throw fallo(
      409,
      "El producto de huevos configurado ya no existe en esta sede."
    );
  }

  const saldo = await saldoInventario(
    producto,
    sede,
    session,
    {
      excluirFactura:
        excluirVenta?.sede === sede
          ? excluirVenta.factura
          : undefined
    }
  );

  if (saldo.stockReal === null) {
    throw fallo(
      409,
      "El inventario de huevos tiene facturas sin fecha única y requiere revisión."
    );
  }

  const cantidad = saldo.stockReal;
  const unidades = Math.round(cantidad * 30);

  if (
    !Number.isFinite(cantidad) ||
    !Number.isSafeInteger(unidades) ||
    Math.abs(cantidad * 30 - unidades) > 0.00001 ||
    (
      unidades < 0 &&
      opciones.permitirNegativo !== true
    )
  ) {
    throw fallo(
      409,
      "La existencia anterior de huevos necesita revisión: debe representar huevos enteros y no ser negativa."
    );
  }

  return {
    producto,
    unidades,
    fechaBase: saldo.fechaBase
  };
}

// DIAGNÓSTICO DE EXISTENCIAS DE HUEVOS
export async function diagnosticoInventarioHuevos(config, sede, session) {
  if (!["MONASTERIO", "TIENDITA"].includes(sede)) {
    throw fallo(400, "Sede inválida.");
  }

  const general = await stockGeneralHuevos(
    config, sede, session, null,
    { permitirNegativo: true }
  );

  const registro = await cargarRegistroHuevos(session);
  const eventos = registro.eventos.filter(e => e.sede === sede);
  const grupos = registro.grupos.map(grupo => {
    const lista = eventos.filter(e => e.grupoId === String(grupo._id));
    const saldo = lista.reduce((suma, e) => suma + e.unidades, 0);

    return {
      grupoId: String(grupo._id),
      nombre: grupo.nombre,
      activo: grupo.activo,
      produccionYRecepcion: lista.filter(e => e.unidades > 0)
        .reduce((suma, e) => suma + e.unidades, 0),
      retiros: lista.filter(e => e.unidades < 0)
        .reduce((suma, e) => suma + Math.abs(e.unidades), 0),
      saldo,
      negativo: saldo < 0
    };
  });

  const totalConGrupo = eventos.reduce((suma, e) => suma + e.unidades, 0);
  const diferencia = general.unidades - totalConGrupo;

  const idsGrupos = new Set(grupos.map(g => g.grupoId));
  const eventosSinGrupoValido = eventos.filter(e => !idsGrupos.has(e.grupoId));

  const inventario = await saldoInventario(general.producto, sede, session);
  const alertas = [];

  if (general.unidades < 0)
    alertas.push("El inventario general tiene existencias negativas.");

  if (diferencia < 0)
    alertas.push(`El seguimiento por grupos supera al inventario general en ${Math.abs(diferencia)} huevos.`);

  if (grupos.some(g => g.negativo))
    alertas.push("Existen grupos con saldo negativo.");

  if (eventosSinGrupoValido.length)
    alertas.push("Existen movimientos asociados a grupos inexistentes.");

  return {
    sede,
    productoId: general.producto._id,
    fechaBase: general.fechaBase,
    inventarioGeneral: {
      stockInicial: Math.round(inventario.stockInicial * 30),
      entradas: Math.round(inventario.totalEntradas * 30),
      salidas: Math.round(inventario.totalSalidas * 30),
      ventas: Math.round(inventario.totalVentas * 30),
      existencia: general.unidades
    },
    totalConGrupo,
    diferencia,
    existenciaSinGrupo: diferencia >= 0 ? diferencia : null,
    huevosFaltantes: Math.max(0, -diferencia),
    cartonesEquivalentes: Math.max(0, -diferencia) / 30,
    grupos,
    eventosSinGrupoValido,
    alertas,
    requiereConciliacion: alertas.length > 0
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
export async function protegerMovimientoHuevos(req, res, next) {
  try {
    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      return next();
    }

    const config = await configuracionHuevos(req.cajaMongo);

    if (!config) return next();

    const ids = [
      config.productoMonasterioId,
      config.productoTienditaId
    ].map(identificador);

    const esEntrada = req.baseUrl.includes("entradas");
    const Modelo = esEntrada ? Entrada : Salida;

    const anterior =
      req.params.id && mongoose.isValidObjectId(req.params.id)
        ? await Modelo.findById(req.params.id)
            .session(req.cajaMongo || null)
            .lean()
        : null;

    const vinculado = anterior && (
      anterior.movimientoHuevosId ||
      anterior.grupoGallinasId ||
      anterior.huevosUnidades != null ||
      anterior.produccionId ||
      anterior.loteId ||
      anterior.envioId ||
      anterior.consumoId ||
      anterior.gastoId
    );

    const esHuevo =
      ids.includes(identificador(anterior?.productoId)) ||
      ids.includes(identificador(req.body?.productoId));

    // Permitir eliminar entradas manuales sin vinculaciones.
    if (
      esEntrada &&
      req.method === "DELETE" &&
      anterior &&
      esHuevo &&
      !vinculado
    ) {
      const sede = anterior.sede === "MONASTERIO"
        ? "MONASTERIO"
        : "TIENDITA";

      // Eliminar dentro de una transacción con control de caja.
      if (!req.cajaMongo?.inTransaction()) {
        return protegerEscrituras(async () => [
          { fecha: anterior.fecha, sede }
        ])(
          req,
          res,
          () => protegerMovimientoHuevos(req, res, next)
        );
      }

      comprobarAcceso(req, sede);

      if (
        !["ADMINISTRADOR", "SUPERVISOR"].includes(
          req.usuarioCaja?.rol
        )
      ) {
        throw fallo(
          403,
          "Debe dirigirse al Supervisor para eliminar esta entrada."
        );
      }

      if (
        anterior.cierre === "S" ||
        anterior.observacion === "COMPRAS"
      ) {
        throw fallo(
          409,
          "No puede eliminar una compra ni una entrada de un período cerrado."
        );
      }

      if (
        identificador(anterior.productoId) !==
        identificador(productoDeHuevos(config, sede))
      ) {
        throw fallo(
          409,
          "El producto no corresponde a la sede de la entrada."
        );
      }

      await bloquearRegistroHuevos(req.cajaMongo);

      await comprobarDiaHuevos(
        dia(anterior.fecha),
        sede,
        req.cajaMongo
      );

      const cantidad = Number(anterior.cantidad);
      const unidades = Math.round(cantidad * 30);

      if (
        !Number.isFinite(cantidad) ||
        cantidad <= 0 ||
        !Number.isSafeInteger(unidades) ||
        Math.abs(cantidad * 30 - unidades) > 0.00001
      ) {
        throw fallo(
          409,
          "Revise la cantidad de esta entrada: debe representar huevos enteros."
        );
      }

      const general = await stockGeneralHuevos(
        config,
        sede,
        req.cajaMongo
      );

      const { eventos } = await cargarRegistroHuevos(
        req.cajaMongo
      );

      const saldoGrupos = eventos
        .filter(
          evento => evento.sede === sede && evento.grupoId
        )
        .reduce(
          (suma, evento) => suma + evento.unidades,
          0
        );

      const saldoRestante = general.unidades - unidades;

      if (
        saldoRestante < 0 ||
        saldoRestante < saldoGrupos
      ) {
        throw fallo(
          409,
          "No puede eliminar esta entrada: dejaría existencias " +
          "negativas o afectaría huevos controlados por grupos."
        );
      }

      return next();
    }

    if (anterior?.movimientoHuevosId || esHuevo) {
      throw fallo(
        409,
        "Registre o corrija este movimiento desde el módulo de huevos."
      );
    }

    return next();
  } catch (error) {
    const mensaje = error.estado
      ? error.message
      : "No se pudo comprobar el movimiento de huevos.";

    return res.status(error.estado || 500).json({
      ok: false,
      error: mensaje,
      mensaje
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