import mongoose from "mongoose";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import Gastos from "../models/dbGastos.js";
import Caja from "../models/dbCaja.js";
import Inventario from "../models/dbInventario.js";
import Ingresos from "../models/dbIngresos.js";
import CierreInventario from "../models/CierreInventario.js";

import {
  aperturaDesdeInventario
} from "../utils/aperturaDesdeInventario.js";

import {
  fallo,
  comprobarAcceso
} from "../utils/controlCaja.js";

const filtroSedeCierre = sede =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

function periodoCierre(anio, mes) {
  const a = Number(anio);
  const m = Number(mes);

  if (
    !Number.isSafeInteger(a) ||
    a < 2000 ||
    a > 9999 ||
    !Number.isSafeInteger(m) ||
    m < 1 ||
    m > 12
  ) {
    throw fallo(
      400,
      "Seleccione un mes y un año válidos."
    );
  }

  return {
    anio: a,
    mes: m,
    inicio: new Date(Date.UTC(a, m - 1, 1)),
    fin: new Date(Date.UTC(a, m, 1))
  };
}

function resumenCierre(
  productos,
  entradas,
  salidas,
  vendidos,
  anterior,
  inicio,
  fin
) {
  const incidencias = [];

  const bases = new Map(
    (anterior?.detalles || []).map(fila => [
      String(fila.productoId),
      fila.stockFinal
    ])
  );

  const mapa = new Map(
    productos.map(producto => {
      const id = String(producto._id);
      const tieneBase = bases.has(id);
      const base = tieneBase ? bases.get(id) : null;

      return [
        id,
        {
          productoId: id,
          codigo: producto.codigo,
          descripcion:
            producto.descripcion || "SIN DESCRIPCIÓN",
          unidad: producto.medida || "",
          stockInicial: base,
          stockInicialReferencia: producto.stock ?? null,
          versionProductoAntes: producto.__v ?? 0,

          baseConfirmada:
            tieneBase &&
            typeof base === "number" &&
            Number.isFinite(base) &&
            base >= 0,

          entradas: 0,
          salidas: 0,
          ventasContado: 0,
          ventasCredito: 0,
          stockFinal: null,
          stockFinalSimulado: null
        }
      ];
    })
  );

  function sumar(fila, campo) {
    const producto = mapa.get(
      String(fila.productoId)
    );

    if (!producto) {
      incidencias.push({
        motivo:
          "Movimiento de un producto que ya no existe en esta sede.",
        id: String(fila._id),
        productoId: String(fila.productoId)
      });

      return;
    }

    if (
      typeof fila.cantidad !== "number" ||
      !Number.isFinite(fila.cantidad) ||
      fila.cantidad < 0
    ) {
      incidencias.push({
        motivo: "Cantidad inválida en un movimiento.",
        id: String(fila._id),
        codigo: producto.codigo
      });

      return;
    }

    producto[campo] += fila.cantidad;

    if (!Number.isFinite(producto[campo])) {
      incidencias.push({
        motivo:
          "La suma de cantidades supera el rango permitido.",
        codigo: producto.codigo
      });
    }
  }

  entradas.forEach(fila => sumar(fila, "entradas"));
  salidas.forEach(fila => sumar(fila, "salidas"));

  for (const fila of vendidos) {
    if (fila.cabeceras.length !== 1) {
      incidencias.push({
        motivo:
          "Detalle vendido sin una factura única en la sede.",
        id: String(fila._id),
        factura: fila.factura
      });

      continue;
    }

    const venta = fila.cabeceras[0];
    const fecha = new Date(venta.fecha);

    if (
      venta.fecha == null ||
      !Number.isFinite(fecha.getTime())
    ) {
      incidencias.push({
        motivo: "Factura con fecha inválida.",
        factura: fila.factura
      });

      continue;
    }

    if (fecha < inicio || fecha >= fin) continue;

    if (
      fila.descuentaInventario === false &&
      venta.estado !== "CREDITO"
    ) {
      continue;
    }

    if (
      venta.tipoMovimiento &&
      venta.tipoMovimiento !== "VENTA"
    ) {
      incidencias.push({
        motivo:
          "Un ingreso que no es venta tiene productos vendidos asociados.",
        factura: fila.factura
      });

      continue;
    }

    if (
      !["CONTADO", "CREDITO"].includes(venta.estado)
    ) {
      incidencias.push({
        motivo:
          "Factura sin estado CONTADO o CREDITO válido.",
        factura: fila.factura
      });

      continue;
    }

    sumar(
      fila,
      venta.estado === "CREDITO"
        ? "ventasCredito"
        : "ventasContado"
    );
  }

  const detalles = [...mapa.values()]
    .map(fila => {
      // Los créditos siguen en elaboración.
      // Sólo se descuentan las ventas de contado.
      const variacion =
        fila.entradas -
        fila.salidas -
        fila.ventasContado;

      if (fila.baseConfirmada) {
        fila.stockFinal =
          fila.stockInicial + variacion;

        if (fila.stockFinal < -0.0000001) {
          incidencias.push({
            motivo:
              "La existencia final sería negativa.",
            codigo: fila.codigo,
            stockFinal: fila.stockFinal
          });
        } else if (fila.stockFinal < 0) {
          fila.stockFinal = 0;
        }
      }

      if (
        !fila.baseConfirmada &&
        typeof fila.stockInicialReferencia === "number" &&
        Number.isFinite(fila.stockInicialReferencia)
      ) {
        fila.stockFinalSimulado =
          fila.stockInicialReferencia + variacion;
      }

      return fila;
    })
    .sort((a, b) =>
      String(a.descripcion).localeCompare(
        String(b.descripcion),
        "es",
        {
          numeric: true,
          sensitivity: "base"
        }
      )
    );

  return {
    detalles,
    incidencias
  };
}

export async function leerVistaPreviaCierreInventario(
  req,
  session
) {
  if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
    throw fallo(
      403,
      "Esta consulta corresponde al administrador."
    );
  }

  const sede = req.query.sede;
  comprobarAcceso(req, sede);

  const {
    anio,
    mes,
    inicio,
    fin
  } = periodoCierre(
    req.query.anio,
    req.query.mes
  );

  const filtroSede = filtroSedeCierre(sede);

  const filtroPeriodo = {
    ...filtroSede,
    fecha: {
      $gte: inicio,
      $lt: fin
    }
  };

  const cerrado = await CierreInventario.findOne({
    sede,
    anio,
    mes
  })
    .select("-claveOperacion -firmaOperacion")
    .session(session)
    .lean();

  if (cerrado) {
    return {
      ok: true,
      estado: "CERRADO",
      puedeCerrar: false,
      sede,
      anio,
      mes,
      cierre: cerrado,

      mensaje:
        "Este cierre ya fue aplicado. Se muestra " +
        "el respaldo guardado; no se vuelve " +
        "a trasladar el stock."
    };
  }

  const anterior = await CierreInventario.findOne({
    sede,
    fechaFin: inicio
  })
    .session(session)
    .lean();

  const productos = await Producto.find(filtroSede)
    .select("codigo descripcion medida stock __v")
    .session(session)
    .lean();

  const inventariosApertura = anterior
    ? []
    : await Inventario.find({
        ...filtroSede,
        fecha: {
          $gte: inicio,
          $lt: new Date(
            inicio.getTime() + 86400000
          )
        }
      })
        .select("productoId stockFisico stockReal fecha")
        .session(session)
        .lean();

  const apertura = anterior
    ? null
    : aperturaDesdeInventario(
        productos,
        inventariosApertura
      );

  const baseParaCalculo = anterior || {
    detalles: apertura.bases.map(base => ({
      productoId: base.productoId,
      stockFinal: base.stockInicial
    }))
  };

  const entradas = await Entrada.find(filtroPeriodo)
    .select("productoId cantidad cierre")
    .session(session)
    .lean();

  const salidas = await Salida.find(filtroPeriodo)
    .select("productoId cantidad cierre")
    .session(session)
    .lean();

  const vendidos = await Vendidos.aggregate([
    {
      $match: filtroSede
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
              ...filtroSede,
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
              fecha: 1,
              estado: 1,
              tipoMovimiento: 1
            }
          }
        ],

        as: "cabeceras"
      }
    },
    {
      $project: {
        productoId: 1,
        factura: 1,
        cantidad: 1,
        descuentaInventario: 1,
        cabeceras: 1
      }
    }
  ]).session(session);

  const modelos = [
    Entrada,
    Salida,
    Ventas,
    Gastos,
    Caja,
    Inventario,
    Ingresos
  ];

  let documentosCerradosAnteriores = false;

  for (const Modelo of modelos) {
    const existe = await Modelo.exists({
      ...filtroPeriodo,
      cierre: "S"
    }).session(session);

    if (existe) {
      documentosCerradosAnteriores = true;
      break;
    }
  }

  const {
    detalles,
    incidencias
  } = resumenCierre(
    productos,
    entradas,
    salidas,
    vendidos,
    baseParaCalculo,
    inicio,
    fin
  );

  if (apertura) {
    incidencias.push(...apertura.incidencias);
  }

  const observaciones = [];

  if (!anterior && !apertura.bases.length) {
    observaciones.push(
      "No se encontró una apertura válida en el " +
      "inventario físico del primer día del mes."
    );
  }

  if (detalles.some(fila => !fila.baseConfirmada)) {
    observaciones.push(
      "Hay productos sin saldo inicial respaldado " +
      "para este mes. Su saldo simulado no debe " +
      "trasladarse automáticamente."
    );
  }

  if (documentosCerradosAnteriores) {
    observaciones.push(
      "Existen documentos marcados como cerrados " +
      "por el procedimiento anterior. Este mes " +
      "requiere conciliación; no debe cerrarse " +
      "otra vez automáticamente."
    );
  }

  if (incidencias.length) {
    observaciones.push(
      "Hay registros inconsistentes que requieren revisión."
    );
  }

  const hoyTexto = new Intl.DateTimeFormat(
    "sv-SE",
    {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());

  const periodoTerminado =
    fin <= new Date(`${hoyTexto}T00:00:00.000Z`);

  if (!periodoTerminado) {
    observaciones.push(
      "El período todavía no ha terminado."
    );
  }

  if (!detalles.length) {
    observaciones.push(
      "La sede no tiene productos para evaluar."
    );
  }

  return {
    ok: true,
    soloLectura: true,
    estado: "VISTA_PREVIA",
    sede,
    anio,
    mes,
    fechaInicio: inicio,
    fechaFin: fin,
    cierreAnteriorId: anterior?._id || null,

    origenBase: anterior
      ? "CIERRE_ANTERIOR"
      : "INVENTARIO_FISICO",

    aperturaInventario: apertura,
    documentosCerradosAnteriores,

    baseConfirmada:
      detalles.length > 0 &&
      detalles.every(fila => fila.baseConfirmada),

    condicionesInventarioCumplidas:
      observaciones.length === 0,

    puedeCerrar: false,
    detalles,
    incidencias,
    observaciones,

    mensaje:
      "Esta consulta no modifica stock ni documentos. " +
      "La confirmación del cierre todavía no está habilitada."
  };
}

export async function vistaPreviaCierreInventario(
  req,
  res
) {
  let session;

  try {
    session = await mongoose.connection.startSession();

    let respuesta;

    await session.withTransaction(
      async () => {
        respuesta =
          await leerVistaPreviaCierreInventario(
            req,
            session
          );
      },
      {
        readConcern: {
          level: "snapshot"
        },
        readPreference: "primary"
      }
    );

    return res.json(respuesta);
  } catch (error) {
    console.error(
      "Error en vista previa de cierre:",
      error
    );

    const mensaje = error.estado
      ? error.message
      : "No se pudo preparar la vista previa del cierre.";

    return res.status(error.estado || 500).json({
      ok: false,
      error: mensaje,
      mensaje
    });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Conservar el resultado de la consulta.
      }
    }
  }
}