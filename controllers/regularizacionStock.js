import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";

import Producto from "../models/Producto.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";

import {
  fallo,
  comprobarAcceso
} from "../utils/controlCaja.js";

import {
  tocarDias
} from "../utils/transaccionCaja.js";

import {
  bloquearRegistroHuevos
} from "../utils/inventarioHuevos.js";

import {
  paginaRegularizacionStock
} from "../utils/paginaRegularizacionStock.js";

import {
  leerVistaPreviaCierreInventario
} from "./cierreInventario.js";

const SEDE = "TIENDITA";
const ANIO = 2026;
const MES = 10;

const INICIO = new Date("2026-10-01T00:00:00.000Z");
const FIN = new Date("2026-11-01T00:00:00.000Z");

const huella = valor =>
  createHash("sha256")
    .update(JSON.stringify(valor))
    .digest("hex");

const claveRegistro = huella([
  "APERTURAS_RESPALDADAS",
  SEDE,
  ANIO,
  MES
]);

function autorizar(req) {
  if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
    throw fallo(
      403,
      "Esta regularización corresponde a la administradora."
    );
  }

  comprobarAcceso(req, SEDE);
}

function consulta(req) {
  return {
    usuarioCaja: req.usuarioCaja,
    query: {
      sede: SEDE,
      anio: String(ANIO),
      mes: String(MES)
    }
  };
}

async function preparar(req, session) {
  const datos = await leerVistaPreviaCierreInventario(
    consulta(req),
    session
  );

  if (datos.estado === "CERRADO") {
    throw fallo(
      409,
      "Octubre ya tiene un cierre aplicado. " +
      "No corresponde esta regularización inicial."
    );
  }

  const incidenciasNoCalculables = (
    datos.incidencias || []
  ).filter(incidencia => ![
    "La existencia final sería negativa.",
    "El producto del inventario no se encuentra en el catálogo de esta sede."
  ].includes(incidencia.motivo));

  if (incidenciasNoCalculables.length) {
    throw fallo(
      409,
      "Hay movimientos o inventarios inconsistentes " +
      "que impiden calcular una apertura fiable. " +
      "Revise la vista previa."
    );
  }

  const productosCasulla = await Producto.find({
    codigo: 738,
    sede: SEDE
  })
    .select("_id")
    .session(session)
    .lean();

  if (productosCasulla.length !== 1) {
    throw fallo(
      409,
      "No se pudo identificar de forma única el producto 738."
    );
  }

  const apartados = await Vendidos.aggregate([
    {
      $match: {
        descuentaInventario: { $ne: false },
        $or: [
          { sede: SEDE },
          { sede: { $exists: false } }
        ]
      }
    },
    {
      $lookup: {
        from: Ventas.collection.name,
        let: { numero: "$factura" },

        pipeline: [
          {
            $match: {
              $or: [
                { sede: SEDE },
                { sede: { $exists: false } }
              ],
              $expr: {
                $eq: ["$factura", "$$numero"]
              }
            }
          },
          {
            $project: {
              fecha: 1,
              estado: 1
            }
          }
        ],

        as: "cabeceras"
      }
    },
    {
      $match: {
        cabeceras: {
          $elemMatch: {
            estado: "CREDITO",
            fecha: {
              $gte: INICIO,
              $lt: FIN
            }
          }
        }
      }
    },
    {
      $project: {
        productoId: 1,
        cantidad: 1,
        factura: 1,
        descuentaInventario: 1,
        cabeceras: 1
      }
    }
  ]).session(session);

  if (apartados.some(fila => fila.cabeceras.length !== 1)) {
    throw fallo(
      409,
      "Los apartados tienen facturas duplicadas. Revise ese registro."
    );
  }

  if (apartados.some(fila =>
    typeof fila.cantidad !== "number" ||
    !Number.isFinite(fila.cantidad) ||
    fila.cantidad <= 0
  )) {
    throw fallo(
      409,
      "Hay cantidades inválidas en los apartados a crédito."
    );
  }

  const apartadosCasulla = apartados.filter(fila =>
    String(fila.productoId) ===
    String(productosCasulla[0]._id)
  );

  const cantidadApartada = apartadosCasulla.reduce(
    (suma, fila) => suma + fila.cantidad,
    0
  );

  if (apartadosCasulla.length && cantidadApartada !== 2) {
    throw fallo(
      409,
      "Los apartados del producto 738 ya no suman " +
      "las dos unidades informadas. Revise la " +
      "vista antes de aplicar cambios."
    );
  }

  const aperturas = datos.detalles
    .filter(fila => fila.baseConfirmada)
    .map(fila => ({
      ...fila,
      apartadosSinEntrega: fila.ventasCredito
    }));

  if (!aperturas.some(fila => fila.codigo === 738)) {
    throw fallo(
      409,
      "Falta el inventario físico inicial del producto 738."
    );
  }

  if (aperturas.some(fila => !Number.isFinite(fila.stockFinal))) {
    throw fallo(409, "Hay un saldo final inválido.");
  }

  const sinApertura = datos.detalles
    .filter(fila => !fila.baseConfirmada)
    .map(fila => ({
      productoId: fila.productoId,
      codigo: fila.codigo,
      descripcion: fila.descripcion
    }));

  const origenes = new Map(
    (datos.aperturaInventario?.bases || []).map(base => [
      String(base.productoId),
      base
    ])
  );

  const firmaPlan = huella({
    sede: SEDE,
    anio: ANIO,
    mes: MES,

    filas: [...aperturas]
      .sort((a, b) =>
        a.productoId.localeCompare(b.productoId)
      )
      .map(fila => [
        fila.productoId,
        fila.stockInicial,
        fila.entradas,
        fila.salidas,
        fila.ventasContado,
        fila.ventasCredito,
        fila.stockFinal,
        fila.stockInicialReferencia,
        fila.versionProductoAntes,
        [
          ...(origenes.get(fila.productoId)?.inventarioIds || [])
        ].sort()
      ]),

    apartados: apartados.map(fila => [
      String(fila._id),
      String(fila.productoId),
      fila.cantidad
    ]).sort(),

    pendientes: sinApertura
      .map(fila => fila.productoId)
      .sort()
  });

  return {
    ok: true,
    soloLectura: true,
    sede: SEDE,
    anio: ANIO,
    mes: MES,
    fechaApertura: FIN,
    firmaPlan,
    aperturas,
    pendientes: sinApertura,

    negativos: aperturas.filter(
      fila => fila.stockFinal < 0
    ),

    apartados: apartados.map(fila => ({
      id: String(fila._id),
      productoId: String(fila.productoId),
      factura: fila.factura,
      cantidad: fila.cantidad
    })),

    origenes: [...origenes.values()],
    incidenciasOriginales: datos.incidencias,

    mensaje:
      "Se actualizarán únicamente los productos " +
      "con inventario físico respaldado. Los demás " +
      "conservarán su stock y quedarán pendientes. " +
      "Las ventas a crédito son apartados sin entrega " +
      "y no descuentan inventario. No se declara " +
      "cerrado el inventario completo."
  };
}

function responder(res, error) {
  console.error("Regularización inicial de stock:", error);

  const mensaje = error.estado
    ? error.message
    : "No se pudo confirmar el cambio. Reintente " +
      "la misma solicitud; no genere otra operación.";

  return res.status(error.estado || 500).json({
    ok: false,
    error: mensaje,
    mensaje
  });
}

export async function vistaRegularizacionStock(req, res) {
  let session;

  try {
    autorizar(req);

    session = await mongoose.connection.startSession();

    let resultado;

    await session.withTransaction(async () => {
      const aplicado = await mongoose.connection.db
        .collection("regularizacionesStock")
        .findOne(
          { _id: claveRegistro },
          { session }
        );

      resultado = aplicado
        ? { ...aplicado.resultado, yaAplicado: true }
        : await preparar(req, session);
    }, {
      readConcern: { level: "snapshot" },
      readPreference: "primary"
    });

    return res.json(resultado);
  } catch (error) {
    return responder(res, error);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Conservar el resultado.
      }
    }
  }
}

export async function aplicarRegularizacionStock(req, res) {
  let session;

  try {
    autorizar(req);

    if (
      !req.session?.tokenRegularizacionStock ||
      req.get("X-Token-Regularizacion") !==
        req.session.tokenRegularizacionStock
    ) {
      throw fallo(
        403,
        "Abra de nuevo la página de regularización " +
        "para validar su sesión."
      );
    }

    const body = req.body || {};

    if (
      body.confirmar !== true ||
      body.aceptarPendientes !== true ||
      body.aceptarNegativos !== true
    ) {
      throw fallo(
        400,
        "Revise y confirme el alcance de la regularización."
      );
    }

    if (
      typeof body.claveOperacion !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(body.claveOperacion)
    ) {
      throw fallo(
        400,
        "Identificador de operación inválido."
      );
    }

    session = await mongoose.connection.startSession();

    let resultado;

    await session.withTransaction(async () => {
      const operaciones = mongoose.connection.db
        .collection("regularizacionesStock");

      const existente = await operaciones.findOne(
        { _id: claveRegistro },
        { session }
      );

      if (existente) {
        resultado = {
          ...existente.resultado,
          repetida: true
        };

        return;
      }

      await bloquearRegistroHuevos(session);

      const dias = [];

      for (
        let fecha = new Date(INICIO);
        fecha < FIN;
        fecha.setUTCDate(fecha.getUTCDate() + 1)
      ) {
        dias.push({
          fecha: fecha.toISOString().slice(0, 10),
          sede: SEDE
        });
      }

      await tocarDias(dias, session);

      const plan = await preparar(req, session);

      if (body.firmaPlan !== plan.firmaPlan) {
        throw fallo(
          409,
          "Los datos cambiaron. Consulte la vista " +
          "previa nuevamente antes de aplicar."
        );
      }

      const origenes = new Map(
        plan.origenes.map(base => [
          String(base.productoId),
          base
        ])
      );

      const cambios = [];

      for (const apartado of plan.apartados) {
        const actualizado = await Vendidos.collection.updateOne(
          {
            _id: new mongoose.Types.ObjectId(apartado.id),
            cantidad: apartado.cantidad,
            descuentaInventario: { $ne: false }
          },
          {
            $set: {
              descuentaInventario: false,
              entregaPendiente: true
            },
            $inc: { __v: 1 }
          },
          { session }
        );

        if (actualizado.modifiedCount !== 1) {
          throw fallo(
            409,
            "El apartado cambió. Actualice la vista previa."
          );
        }
      }

      const ids = plan.aperturas.map(fila =>
        new mongoose.Types.ObjectId(fila.productoId)
      );

      const anteriores = new Map(
        (
          await Producto.collection.find(
            { _id: { $in: ids } },
            { session }
          ).toArray()
        ).map(producto => [
          String(producto._id),
          producto
        ])
      );

      const coleccionAperturas = mongoose.connection.db
        .collection("aperturasStockInventario");

      const aperturasExistentes = await coleccionAperturas.find(
        {
          productoId: { $in: ids },
          sede: SEDE,
          fechaBase: { $gte: FIN }
        },
        { session }
      ).toArray();

      if (aperturasExistentes.length) {
        throw fallo(
          409,
          "Hay productos con una apertura de " +
          "noviembre o posterior ya aplicada."
        );
      }

      const respaldos = [];
      const actualizaciones = [];

      for (const fila of plan.aperturas) {
        const productoId = new mongoose.Types.ObjectId(
          fila.productoId
        );

        const anterior = anteriores.get(
          fila.productoId
        );

        if (
          !anterior ||
          (anterior.sede || SEDE) !== SEDE ||
          (anterior.stock ?? null) !== fila.stockInicialReferencia ||
          (anterior.__v ?? 0) !== fila.versionProductoAntes
        ) {
          throw fallo(
            409,
            "El producto " + fila.codigo +
            " cambió. Vuelva a consultar."
          );
        }

        const aperturaId = huella([
          SEDE,
          fila.productoId,
          FIN.toISOString()
        ]);

        const origen = origenes.get(fila.productoId);

        if (!origen) {
          throw fallo(
            409,
            "Falta el respaldo físico del producto " +
            fila.codigo + "."
          );
        }

        respaldos.push({
          _id: aperturaId,
          regularizacionId: claveRegistro,
          productoId,
          codigo: fila.codigo,
          sede: SEDE,
          fechaOrigen: INICIO,
          stockOrigen: fila.stockInicial,
          inventarioIds: origen.inventarioIds,
          fechaBase: FIN,
          stockInicial: fila.stockFinal,
          stockAnterior: anterior.stock ?? 0,

          stockAnteriorExistia:
            Object.prototype.hasOwnProperty.call(
              anterior,
              "stock"
            ),

          versionAnterior: anterior.__v ?? 0,
          detalle: fila,
          registradoPor: req.usuarioCaja._id,
          registradoEl: new Date()
        });

        const filtro = {
          _id: productoId,
          stock: anterior.stock ?? null,

          ...(
            anterior.__v === undefined
              ? { __v: { $exists: false } }
              : { __v: anterior.__v }
          )
        };

        actualizaciones.push({
          updateOne: {
            filter: filtro,
            update: {
              $set: {
                stock: fila.stockFinal
              },
              $inc: {
                __v: 1
              }
            }
          }
        });

        cambios.push({
          productoId,
          codigo: fila.codigo,
          anterior: anterior.stock ?? null,
          nuevo: fila.stockFinal
        });
      }

      if (!respaldos.length) {
        throw fallo(
          409,
          "No hay aperturas respaldadas para aplicar."
        );
      }

      await coleccionAperturas.insertMany(
        respaldos,
        {
          session,
          ordered: true
        }
      );

      const cambiado = await Producto.collection.bulkWrite(
        actualizaciones,
        {
          session,
          ordered: true
        }
      );

      if (
        cambiado.modifiedCount !== actualizaciones.length
      ) {
        throw fallo(
          409,
          "Un producto cambió durante la operación. " +
          "No se aplicó el traslado; consulte nuevamente."
        );
      }

      resultado = {
        ok: true,
        aplicada: true,
        cierreCompleto: false,
        sede: SEDE,
        fechaApertura: FIN,
        productosActualizados: cambios.length,
        productosPendientes: plan.pendientes.length,

        negativos: plan.negativos.map(fila => ({
          codigo: fila.codigo,
          stock: fila.stockFinal
        })),

        apartados: plan.apartados,

        huevos: plan.aperturas.find(
          fila => fila.codigo === 202
        )?.stockFinal,

        mensaje:
          "Aperturas respaldadas aplicadas. Los productos " +
          "sin conteo quedan pendientes y las diferencias " +
          "negativas se conservaron. No se modificaron " +
          "importes, pagos ni cantidades de ventas."
      };

      await operaciones.insertOne(
        {
          _id: claveRegistro,
          sede: SEDE,
          anio: ANIO,
          mes: MES,
          usuarioId: req.usuarioCaja._id,
          claveOperacion: body.claveOperacion,
          firmaPlan: plan.firmaPlan,
          fecha: new Date(),
          cambios,
          pendientes: plan.pendientes,
          apartados: plan.apartados,
          resultado
        },
        { session }
      );
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary"
    });

    return res.json(resultado);
  } catch (error) {
    return responder(res, error);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Conservar el resultado confirmado.
      }
    }
  }
}

export async function paginaAdministrativaStock(req, res) {
  try {
    autorizar(req);

    if (!req.session.tokenRegularizacionStock) {
      req.session.tokenRegularizacionStock =
        randomBytes(24).toString("hex");
    }

    res.set("Cache-Control", "no-store");
    res.set("X-Frame-Options", "DENY");

    return res.type("html").send(
      paginaRegularizacionStock(
        req.session.tokenRegularizacionStock,
        req.usuarioCaja._id
      )
    );
  } catch (error) {
    return responder(res, error);
  }
}