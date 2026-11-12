import mongoose from "mongoose";
import DocumentoInventario from "../models/DocumentoInventario.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Producto from "../models/Producto.js";
import {
  saldoInventario
} from "../utils/saldoInventario.js";
import {
  fallo,
  comprobarAcceso
} from "../utils/controlCaja.js";

import {
  comprobarDiaHuevos
} from "../utils/periodoHuevos.js";

import {
  siguienteReferenciaDocumento
} from "../utils/operacionDocumentoInventario.js";
import Vendidos from "../models/dbVendidos.js";

import {
  ConfiguracionHuevos
} from "../models/Huevos.js";

const TIPOS = ["ENTRADA", "SALIDA"];
const SEDES = ["TIENDITA", "MONASTERIO"];

const MOTIVOS = {
  ENTRADA: [
    "PRODUCCIÓN DEL MONASTERIO",
    "DONACIONES",
    "REPOSICIÓN",
    "AJUSTE"
  ],

  SALIDA: [
    "CONSUMO INTERNO",
    "DONACIONES",
    "MERMA",
    "REPOSICIÓN",
    "AJUSTE"
  ]
};

// ==========================================
// VALIDACIONES
// ==========================================
function esAdministrador(req) {
  return req.usuarioCaja?.rol === "ADMINISTRADOR";
}

function exigirAdministrador(req) {
  if (!esAdministrador(req)) {
    throw fallo(
      403,
      "Esta acción corresponde al administrador."
    );
  }
}

function texto(valor, limite = 2000) {
  if (valor === undefined || valor === null) {
    return "";
  }

  if (
    typeof valor !== "string" ||
    valor.length > limite
  ) {
    throw fallo(
      400,
      "Revise el texto ingresado: supera el límite o no es válido."
    );
  }

  return valor.trim();
}

function identificador(valor) {
  if (
    typeof valor !== "string" ||
    !/^[a-f\d]{24}$/i.test(valor)
  ) {
    throw fallo(
      400,
      "Identificador de documento o producto inválido."
    );
  }

  return new mongoose.Types.ObjectId(valor);
}

function fechaComercial(valor) {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    throw fallo(400, "Seleccione una fecha válida.");
  }

  const fecha = new Date(
    `${valor}T00:00:00.000Z`
  );

  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== valor
  ) {
    throw fallo(400, "Seleccione una fecha válida.");
  }

  return fecha;
}

function hoyVenezuela() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function sedeAutorizada(req, valor) {
  if (!SEDES.includes(valor)) {
    throw fallo(
      400,
      "Seleccione una sede válida."
    );
  }

  comprobarAcceso(req, valor);

  return valor;
}

function numeroPagina(
  valor,
  predeterminado,
  maximo
) {
  const numero = valor === undefined
    ? predeterminado
    : Number(valor);

  if (
    !Number.isSafeInteger(numero) ||
    numero < 1 ||
    numero > maximo
  ) {
    throw fallo(
      400,
      "La página o el límite solicitado no es válido."
    );
  }

  return numero;
}

function responderError(res, error) {
  console.error(
    "Error consultando documentos de inventario:",
    error
  );

  const mensaje = error.estado
    ? error.message
    : "No se pudieron consultar los documentos.";

  return res.status(error.estado || 500).json({
    ok: false,
    error: mensaje,
    mensaje
  });
}

function comprobarVersion(documento, version) {
  if (
    !Number.isSafeInteger(version) ||
    version !== documento.__v
  ) {
    throw fallo(
      409,
      "El documento cambió. Actualice el listado y vuelva a revisarlo."
    );
  }
}

// ==========================================
// OPCIONES PARA LOS FORMULARIOS
// ==========================================
export async function opcionesDocumentos(req, res) {
  try {
    const sede = sedeAutorizada(
      req,
      req.query.sede
    );

    return res.json({
      ok: true,
      sede,
      motivos: MOTIVOS,
      esAdministrador: esAdministrador(req)
    });
  } catch (error) {
    return responderError(res, error);
  }
}

// ==========================================
// LISTADO CON FILTROS Y PAGINACIÓN
// ==========================================
export async function listarDocumentos(req, res) {
  let session;

  try {
    const sede = sedeAutorizada(
      req,
      req.query.sede
    );

    const filtro = { sede };

    if (
      req.query.tipo &&
      req.query.tipo !== "TODOS"
    ) {
      if (!TIPOS.includes(req.query.tipo)) {
        throw fallo(
          400,
          "Tipo de documento inválido."
        );
      }

      filtro.tipo = req.query.tipo;
    }

    if (
      req.query.estado &&
      req.query.estado !== "TODOS"
    ) {
      if (
        !["PENDIENTE", "VERIFICADO"].includes(
          req.query.estado
        )
      ) {
        throw fallo(
          400,
          "Estado de documento inválido."
        );
      }

      filtro.estado = req.query.estado;
    }

    if (req.query.desde || req.query.hasta) {
      const desde = fechaComercial(req.query.desde);
      const hasta = fechaComercial(req.query.hasta);

      if (desde > hasta) {
        throw fallo(
          400,
          "Revise el rango de fechas."
        );
      }

      filtro.fecha = {
        $gte: desde,
        $lt: new Date(
          hasta.getTime() + 86400000
        )
      };
    }

    const page = numeroPagina(
      req.query.page,
      1,
      1000000
    );

    const limit = numeroPagina(
      req.query.limit,
      20,
      100
    );

    let respuesta;

    session =
      await mongoose.connection.startSession();

    await session.withTransaction(
      async () => {
        const total = await DocumentoInventario
          .countDocuments(filtro)
          .session(session);

        const documentos = await DocumentoInventario
          .find(filtro)
          .select("-claveOperacion -firmaOperacion")
          .populate(
            "registradoPor",
            "nombre usuario"
          )
          .populate(
            "verificadoPor",
            "nombre usuario"
          )
          .sort({
            fecha: -1,
            createdAt: -1,
            _id: -1
          })
          .skip((page - 1) * limit)
          .limit(limit)
          .session(session)
          .lean();

        respuesta = {
          ok: true,
          documentos,
          total,
          page,
          totalPages: Math.max(
            1,
            Math.ceil(total / limit)
          ),
          esAdministrador: esAdministrador(req)
        };
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
    return responderError(res, error);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Mantener el resultado de la consulta.
      }
    }
  }
}

// ==========================================
// CONSULTAR UN DOCUMENTO COMPLETO
// ==========================================
export async function obtenerDocumento(req, res) {
  try {
    const documento = await DocumentoInventario
      .findById(
        identificador(req.params.id)
      )
      .select("-claveOperacion -firmaOperacion")
      .populate(
        "registradoPor",
        "nombre usuario"
      )
      .populate(
        "verificadoPor",
        "nombre usuario"
      )
      .populate(
        "historialRevision.usuarioId",
        "nombre usuario"
      )
      .lean();

    if (!documento) {
      throw fallo(
        404,
        "Documento no encontrado."
      );
    }

    sedeAutorizada(req, documento.sede);

    return res.json({
      ok: true,
      documento,
      esAdministrador: esAdministrador(req)
    });
  } catch (error) {
    return responderError(res, error);
  }
}

// ==========================================
// EXISTENCIA GENERAL DEL PRODUCTO
// ==========================================
function filtroSedeDocumento(sede) {
  return sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };
}

async function existenciaDocumento(
  producto,
  sede,
  session
) {
  const saldo = await saldoInventario(
    producto,
    sede,
    session
  );

  if (saldo.stockReal === null) {
    throw fallo(
      409,
      "El inventario contiene facturas pendientes de revisión."
    );
  }

  return saldo.stockReal;
}

// ==========================================
// CREAR DOCUMENTO CON TODOS SUS ARTÍCULOS
// ==========================================
export async function crearDocumento(
  req,
  session,
  operacion
) {
  const body = req.body || {};
  const tipo = body.tipo;

  const sede = sedeAutorizada(req, body.sede);
  const fecha = fechaComercial(body.fecha);
  const motivo = texto(body.motivo, 100);
  const observaciones = texto(body.observaciones);

  if (
    !TIPOS.includes(tipo) ||
    !MOTIVOS[tipo].includes(motivo)
  ) {
    throw fallo(
      400,
      "Seleccione un tipo y un motivo válidos. " +
      "Las compras y los envíos se registran desde sus módulos."
    );
  }

  if (body.fecha > hoyVenezuela()) {
    throw fallo(
      400,
      "No registre documentos con fecha futura."
    );
  }

  if (motivo === "AJUSTE") {
    exigirAdministrador(req);
  }

  if (
    !Array.isArray(body.detalles) ||
    !body.detalles.length ||
    body.detalles.length > 200
  ) {
    throw fallo(
      400,
      "Incluya entre 1 y 200 artículos."
    );
  }

  await comprobarDiaHuevos(
    body.fecha,
    sede,
    session
  );

  const referencia =
    await siguienteReferenciaDocumento(
      tipo,
      session
    );

  const configHuevos = await ConfiguracionHuevos
    .findById("HUEVOS")
    .session(session)
    .lean();

  const idsHuevos = configHuevos
    ? [
        configHuevos.productoMonasterioId,
        configHuevos.productoTienditaId
      ].map(String)
    : [];

  const usados = new Set();
  const detalles = [];

  const filas = body.detalles
    .map(fila => {
      if (!fila || typeof fila !== "object") {
        throw fallo(
          400,
          "Hay un artículo inválido."
        );
      }

      const productoId = identificador(
        fila.productoId
      );

      const cantidad = fila.cantidad;

      if (
        typeof cantidad !== "number" ||
        !Number.isFinite(cantidad) ||
        cantidad <= 0
      ) {
        throw fallo(
          400,
          "Todas las cantidades deben ser números mayores que cero."
        );
      }

      if (usados.has(String(productoId))) {
        throw fallo(
          400,
          "Un producto está repetido. " +
          "Coloque su cantidad en una sola fila."
        );
      }

      usados.add(String(productoId));

      return {
        productoId,
        cantidad
      };
    })
    .sort((a, b) =>
      String(a.productoId).localeCompare(
        String(b.productoId)
      )
    );

  for (const fila of filas) {
    const producto = await Producto
      .findById(fila.productoId)
      .session(session)
      .lean();

    if (!producto) {
      throw fallo(
        404,
        "Uno de los productos ya no existe. " +
        "Actualice el formulario."
      );
    }

    if ((producto.sede || "TIENDITA") !== sede) {
      throw fallo(
        400,
        `El producto ${producto.codigo} pertenece a otra sede.`
      );
    }

    if (
      idsHuevos.includes(String(producto._id))
    ) {
      throw fallo(
        409,
        `El producto ${producto.codigo} se registra ` +
        "desde el módulo de huevos para conservar su seguimiento."
      );
    }

    const entradaControlada = await Entrada
      .findOne({
        productoId: producto._id,
        $or: [
          { loteId: { $ne: null } },
          { produccionId: { $ne: null } }
        ]
      })
      .select("_id")
      .session(session)
      .lean();

    if (entradaControlada) {
      throw fallo(
        409,
        `El producto ${producto.codigo} tiene ` +
        "seguimiento por lote. Registre su movimiento " +
        "desde el módulo del lote."
      );
    }

    if (
      tipo === "ENTRADA" &&
      motivo === "PRODUCCIÓN DEL MONASTERIO" &&
      producto.origen !== "PRODUCCION_MONASTERIO"
    ) {
      throw fallo(
        400,
        `El producto ${producto.codigo} no está ` +
        "marcado como producción del Monasterio."
      );
    }

    // Coordinar documentos del mismo producto.
    // Esto no cambia el stock inicial.
    await Producto.updateOne(
      { _id: producto._id },
      { $inc: { __v: 1 } },
      { session }
    );

    if (tipo === "SALIDA") {
      const saldo = await existenciaDocumento(
        producto,
        sede,
        session
      );

      if (fila.cantidad > saldo + 0.0000001) {
        throw fallo(
          409,
          `Existencia insuficiente del producto ` +
          `${producto.codigo}. Disponible: ${saldo}.`
        );
      }
    }

    detalles.push({
      productoId: producto._id,
      codigo: producto.codigo,
      descripcion: producto.descripcion,
      categoria: producto.categoria || "",
      unidad: producto.medida || "",
      cantidad: fila.cantidad,

      ...(
        tipo === "ENTRADA" &&
        motivo === "PRODUCCIÓN DEL MONASTERIO"
          ? {
              precioVenta: Number(
                producto.venta || 0
              )
            }
          : {}
      )
    });
  }

  // Comparar los artículos sin depender de su orden.
  const firmaArticulos = lista =>
    lista
      .map(fila =>
        `${fila.productoId}:${fila.cantidad}`
      )
      .sort()
      .join("|");

  const candidatos = await DocumentoInventario
    .find({
      tipo,
      sede,
      fecha,
      motivo
    })
    .select(
      "referencia detalles.productoId detalles.cantidad"
    )
    .session(session)
    .lean();

  const posible = candidatos.find(
    documento =>
      firmaArticulos(documento.detalles) ===
      firmaArticulos(detalles)
  );

  if (
    posible &&
    body.confirmarPosibleDuplicado !== true
  ) {
    throw fallo(
      409,
      `POSIBLE DUPLICADO: ${posible.referencia} ` +
      "tiene la misma fecha, motivo, productos y cantidades. " +
      "Revise ese documento antes de confirmar otro registro."
    );
  }

  if (posible) {
    const motivoRepeticion = texto(
      body.motivoRepeticion,
      500
    );

    if (!motivoRepeticion) {
      throw fallo(
        400,
        "Indique por qué corresponde registrar " +
        "otro documento con los mismos datos."
      );
    }

    if (
      (observaciones + motivoRepeticion).length >
      1900
    ) {
      throw fallo(
        400,
        "Acorte las observaciones y el motivo de repetición."
      );
    }
  }

  const documento = new DocumentoInventario({
    tipo,
    referencia,
    fecha,
    sede,
    motivo,

    observaciones: posible
      ? (
          `${observaciones}\n` +
          `Registro similar a ${posible.referencia}: ` +
          texto(body.motivoRepeticion, 500)
        ).trim()
      : observaciones,

    registradoPor: req.usuarioCaja._id,
    estado: "PENDIENTE",
    detalles,
    ...operacion
  });

  const Modelo =
    tipo === "ENTRADA" ? Entrada : Salida;

  for (const detalle of documento.detalles) {
    const movimiento = new Modelo({
      fecha,
      sede,
      categoria: detalle.categoria,
      productoId: detalle.productoId,
      codigo: detalle.codigo,
      cantidad: detalle.cantidad,
      observacion: motivo,

      ...(tipo === "ENTRADA"
        ? {
            precioCompra:
              motivo === "PRODUCCIÓN DEL MONASTERIO"
                ? 0
                : null,

            precioVenta:
              detalle.precioVenta ?? null
          }
        : {})
    });

    await movimiento.save({ session });

    if (tipo === "ENTRADA") {
      detalle.entradaId = movimiento._id;
    } else {
      detalle.salidaId = movimiento._id;
    }
  }

  await documento.save({ session });

  return {
    ok: true,
    id: String(documento._id),
    referencia,
    mensaje:
      "Documento guardado. " +
      "Pendiente de revisión administrativa."
  };
}

// ==========================================
// REVISIÓN ADMINISTRATIVA
// ==========================================
async function cargarDocumentoParaCambiar(
  req,
  session
) {
  const documento = await DocumentoInventario
    .findById(
      identificador(req.params.id)
    )
    .session(session);

  if (!documento) {
    throw fallo(
      404,
      "Documento no encontrado."
    );
  }

  sedeAutorizada(req, documento.sede);

  comprobarVersion(
    documento,
    req.body?.versionEsperada
  );

  return documento;
}

async function comprobarArticulosDocumento(
  documento,
  session
) {
  if (!documento.detalles.length) {
    throw fallo(
      409,
      "El documento no contiene artículos."
    );
  }

  const Modelo = documento.tipo === "ENTRADA"
    ? Entrada
    : Salida;

  const vistos = new Set();

  for (const detalle of documento.detalles) {
    const movimientoId =
      documento.tipo === "ENTRADA"
        ? detalle.entradaId
        : detalle.salidaId;

    if (
      !movimientoId ||
      vistos.has(String(movimientoId))
    ) {
      throw fallo(
        409,
        "El documento tiene movimientos faltantes " +
        "o repetidos. Revíselo antes de verificarlo."
      );
    }

    vistos.add(String(movimientoId));

    const movimiento = await Modelo
      .findById(movimientoId)
      .session(session)
      .lean();

    if (
      !movimiento ||
      String(movimiento.productoId) !==
        String(detalle.productoId) ||
      Number(movimiento.cantidad) !==
        Number(detalle.cantidad) ||
      (movimiento.sede || "TIENDITA") !==
        documento.sede ||
      new Date(movimiento.fecha)
        .toISOString()
        .slice(0, 10) !==
        documento.fecha.toISOString().slice(0, 10) ||
      movimiento.observacion !==
        documento.motivo ||
      Number(movimiento.codigo) !==
        Number(detalle.codigo) ||
      (movimiento.categoria || "") !==
        (detalle.categoria || "")
    ) {
      throw fallo(
        409,
        `El movimiento del producto ${detalle.codigo} ` +
        "no coincide con el documento. " +
        "Revise la diferencia antes de verificar."
      );
    }

    // Coordinar la revisión con los cambios del movimiento.
    await Modelo.updateOne(
      { _id: movimientoId },
      { $inc: { __v: 1 } },
      { session }
    );
  }
}

async function auditarDocumento(
  req,
  session,
  accion,
  antes,
  despues
) {
  await mongoose.connection.db
    .collection("auditoriaDocumentosInventario")
    .insertOne(
      {
        documentoId:
          despues?._id || antes?._id,

        referencia:
          despues?.referencia ||
          antes?.referencia,

        accion,
        usuarioId: req.usuarioCaja._id,
        fecha: new Date(),

        antes: antes || null,
        despues: despues || null
      },
      { session }
    );
}

export async function revisarDocumento(
  req,
  session
) {
  exigirAdministrador(req);

  const accion = req.body?.accion;

  if (
    !["VERIFICAR", "REABRIR"].includes(accion)
  ) {
    throw fallo(
      400,
      "Seleccione una acción de revisión válida."
    );
  }

  const observacion = texto(
    req.body?.observacion
  );

  if (
    accion === "REABRIR" &&
    !observacion
  ) {
    throw fallo(
      400,
      "Indique el motivo para reabrir el documento."
    );
  }

  const documento =
    await cargarDocumentoParaCambiar(
      req,
      session
    );

  const antes = documento.toObject();

  if (accion === "VERIFICAR") {
    if (documento.estado !== "PENDIENTE") {
      throw fallo(
        409,
        "Este documento ya está verificado. " +
        "Actualice el listado."
      );
    }

    await comprobarArticulosDocumento(
      documento,
      session
    );

    documento.estado = "VERIFICADO";
    documento.verificadoPor =
      req.usuarioCaja._id;
    documento.fechaVerificacion = new Date();
  } else {
    if (documento.estado !== "VERIFICADO") {
      throw fallo(
        409,
        "Este documento ya está pendiente " +
        "de revisión. Actualice el listado."
      );
    }

    documento.estado = "PENDIENTE";
    documento.verificadoPor = null;
    documento.fechaVerificacion = null;
  }

  documento.historialRevision.push({
    accion,
    usuarioId: req.usuarioCaja._id,
    fecha: new Date(),
    observacion
  });

  await documento.save({ session });

  await auditarDocumento(
    req,
    session,
    accion,
    antes,
    documento.toObject()
  );

  return {
    ok: true,
    id: String(documento._id),
    referencia: documento.referencia,
    estado: documento.estado,
    version: documento.__v,

    mensaje: accion === "VERIFICAR"
      ? (
          "Documento verificado. Queda bloqueado " +
          "para modificaciones y eliminación."
        )
      : (
          "Documento reabierto. Queda pendiente " +
          "de revisión. Los cierres de caja " +
          "y de mes siguen vigentes."
        )
  };
}

// ==========================================
// ELIMINAR DOCUMENTO COMPLETO
// ==========================================
export async function eliminarDocumento(
  req,
  session
) {
  const documento =
    await cargarDocumentoParaCambiar(
      req,
      session
    );

  const rol = req.usuarioCaja?.rol;

  if (
    !["ADMINISTRADOR", "SUPERVISOR"].includes(rol)
  ) {
    throw fallo(
      403,
      "La eliminación corresponde al administrador o al supervisor."
    );
  }

  if (documento.estado !== "PENDIENTE") {
    throw fallo(
      409,
      "El documento está verificado. " +
      "La administradora debe reabrirlo antes de eliminarlo."
    );
  }

  if (documento.cierre === "S") {
    throw fallo(
      423,
      "El documento pertenece a un período cerrado."
    );
  }

  if (documento.motivo === "AJUSTE") {
    exigirAdministrador(req);
  }

  const motivo = texto(
    req.body?.motivoEliminacion
  );

  if (!motivo) {
    throw fallo(
      400,
      "Indique por qué elimina el documento."
    );
  }

  const fecha = documento.fecha
    .toISOString()
    .slice(0, 10);

  await comprobarDiaHuevos(
    fecha,
    documento.sede,
    session
  );

  await comprobarArticulosDocumento(
    documento,
    session
  );

  const configHuevos = await ConfiguracionHuevos
    .findById("HUEVOS")
    .session(session)
    .lean();

  const idsHuevos = configHuevos
    ? [
        configHuevos.productoMonasterioId,
        configHuevos.productoTienditaId
      ].map(String)
    : [];

  const Modelo = documento.tipo === "ENTRADA"
    ? Entrada
    : Salida;

  const detalles = [...documento.detalles].sort(
    (a, b) =>
      String(a.productoId).localeCompare(
        String(b.productoId)
      )
  );

  for (const detalle of detalles) {
    if (
      idsHuevos.includes(String(detalle.productoId))
    ) {
      throw fallo(
        409,
        "Este producto ahora tiene control de huevos. " +
        "Revise su seguimiento antes de eliminar el documento anterior."
      );
    }

    const producto = await Producto
      .findById(detalle.productoId)
      .session(session)
      .lean();

    if (
      !producto ||
      (producto.sede || "TIENDITA") !==
        documento.sede
    ) {
      throw fallo(
        409,
        `Revise el producto ${detalle.codigo}: ` +
        "ya no existe en la sede del documento."
      );
    }

    const controlado = await Entrada
      .findOne({
        productoId: detalle.productoId,
        $or: [
          { loteId: { $ne: null } },
          { produccionId: { $ne: null } }
        ]
      })
      .select("_id")
      .session(session)
      .lean();

    if (controlado) {
      throw fallo(
        409,
        `El producto ${detalle.codigo} ahora tiene ` +
        "seguimiento por lote. Revíselo antes de eliminar."
      );
    }

    await Producto.updateOne(
      { _id: producto._id },
      { $inc: { __v: 1 } },
      { session }
    );

    if (documento.tipo === "ENTRADA") {
      const saldo = await existenciaDocumento(
        producto,
        documento.sede,
        session
      );

      if (
        saldo - detalle.cantidad <
        -0.0000001
      ) {
        throw fallo(
          409,
          "No puede eliminar: el producto " +
          `${detalle.codigo} quedaría con existencia negativa.`
        );
      }
    }

    const movimientoId =
      documento.tipo === "ENTRADA"
        ? detalle.entradaId
        : detalle.salidaId;

    const eliminado = await Modelo.deleteOne(
      {
        _id: movimientoId,
        productoId: detalle.productoId,
        cantidad: detalle.cantidad,
        cierre: { $ne: "S" },

        gastoId: null,
        loteId: null,
        produccionId: null,
        consumoId: null,
        envioId: null,
        movimientoHuevosId: null,
        grupoGallinasId: null,

        huevosUnidades: {
          $exists: false
        }
      },
      {
        session,
        strictQuery: false
      }
    );

    if (eliminado.deletedCount !== 1) {
      throw fallo(
        409,
        `El movimiento del producto ${detalle.codigo} ` +
        "está cerrado, vinculado o cambió. " +
        "Actualice el documento."
      );
    }
  }

  const antes = documento.toObject();

  await auditarDocumento(
    req,
    session,
    "ELIMINAR",
    antes,
    null
  );

  await mongoose.connection.db
    .collection("auditoriaDocumentosInventario")
    .insertOne(
      {
        documentoId: documento._id,
        referencia: documento.referencia,
        accion: "MOTIVO_ELIMINACION",
        usuarioId: req.usuarioCaja._id,
        fecha: new Date(),
        motivo
      },
      { session }
    );

  const borrado = await DocumentoInventario
    .deleteOne(
      {
        _id: documento._id,
        __v: documento.__v,
        estado: "PENDIENTE",
        cierre: { $ne: "S" }
      },
      { session }
    );

  if (borrado.deletedCount !== 1) {
    throw fallo(
      409,
      "El documento cambió. Actualice el listado."
    );
  }

  return {
    ok: true,
    id: String(documento._id),
    referencia: documento.referencia,
    mensaje:
      "Documento eliminado completo. " +
      "Se conservó la auditoría y el motivo."
  };
}