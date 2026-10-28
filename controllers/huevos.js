import mongoose from "mongoose";
import { createHash } from "node:crypto";

import {
  GrupoGallinas,
  ConfiguracionHuevos,
  MovimientoHuevos,
  OperacionHuevos,
  AuditoriaHuevos
} from "../models/Huevos.js";

import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Producto from "../models/Producto.js";
import Gastos from "../models/dbGastos.js";
import Vendidos from "../models/dbVendidos.js";
import Tasas from "../models/dbTasas.js";
import Moneda from "../models/dbMoneda.js";
import Actividad from "../models/dbListaProductiva.js";

import {
  cobrosPorGrupoHuevos
} from "../utils/cobrosHuevos.mjs";

import {
  comprobarAcceso,
  fallo
} from "../utils/controlCaja.js";

import {
  comprobarDiaHuevos as abierto
} from "../utils/periodoHuevos.js";

import {
  produccionHuevos,
  recepcionHuevos
} from "../utils/calculoHuevos.mjs";

import {
  dia,
  eventosHuevos,
  validarExistencias,
  disponiblesDesde,
  gallinasDisponibles,
  validarProduccionGallinas
} from "../utils/registroHuevos.mjs";

import {
  configuracionHuevos,
  bloquearRegistroHuevos,
  cargarRegistroHuevos,
  productoDeHuevos,
  stockGeneralHuevos
} from "../utils/inventarioHuevos.js";

// CONCEPTOS DE GASTOS
export const CONCEPTOS_HUEVOS = [
  "COMPRA_GALLINAS",
  "ALIMENTO",
  "MEDICAMENTOS_VACUNAS",
  "CAMA_LIMPIEZA",
  "ATENCION_VETERINARIA",
  "EMPAQUE",
  "TRANSPORTE",
  "OTROS"
];

// FECHA ACTUAL DE VENEZUELA
const hoy = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

// VALIDAR IDENTIFICADORES
const id = (valor) => {
  if (
    !/^[a-f\d]{24}$/i.test(String(valor || ""))
  ) {
    throw fallo(400, "Identificador inválido.");
  }

  return String(valor);
};

// VALIDAR FECHAS
const fecha = (valor) => {
  let resultado;

  try {
    resultado = dia(valor);
  } catch {
    throw fallo(
      400,
      "Seleccione una fecha válida."
    );
  }

  if (
    typeof valor !== "string" ||
    valor !== resultado ||
    resultado > hoy()
  ) {
    throw fallo(
      400,
      "Seleccione una fecha válida, sin fechas futuras."
    );
  }

  return resultado;
};

// VALIDAR CANTIDADES ENTERAS
const entero = (valor, nombre, minimo = 0) => {
  if (
    typeof valor !== "number" ||
    !Number.isSafeInteger(valor) ||
    valor < minimo
  ) {
    throw fallo(
      400,
      `${nombre}: indique un número entero mayor o igual a ${minimo}.`
    );
  }

  return valor;
};

// VALIDAR TEXTOS
const texto = (valor, maximo = 2000) => {
  if (valor === undefined) return "";

  if (
    typeof valor !== "string" ||
    valor.trim().length > maximo
  ) {
    throw fallo(
      400,
      "Texto inválido o demasiado largo."
    );
  }

  return valor.trim();
};

// VALIDAR IMPORTES Y CONVERTIR A CENTAVOS
const centavos = (valor) => {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor <= 0 ||
    !Number.isSafeInteger(Math.round(valor * 100)) ||
    Math.abs(
      valor * 100 - Math.round(valor * 100)
    ) > 0.00001
  ) {
    throw fallo(
      400,
      "El importe debe ser positivo y tener hasta dos decimales."
    );
  }

  return Math.round(valor * 100);
};

// CONTROL ADMINISTRATIVO
const administrador = (req) => {
  if (
    req.usuarioCaja?.rol !== "ADMINISTRADOR"
  ) {
    throw fallo(
      403,
      "Esta opción es solo para el administrador."
    );
  }
};

// RESPUESTAS DE ERROR
function errorRespuesta(res, error) {
  console.error("Módulo de huevos:", error);

  let estado = error.estado || 500;

  if (
    ["ValidationError", "CastError"].includes(error.name)
  ) {
    estado = 400;
  }

  if (
    error.code === 11000 ||
    error.name === "VersionError"
  ) {
    estado = 409;
  }

  const mensaje = error.estado
    ? error.message
    : estado === 400
      ? "Los datos no cumplen las validaciones."
      : estado === 409
        ? "La información cambió. Actualice antes de continuar."
        : "No se pudo confirmar la operación. Conserve la solicitud y reintente.";

  return res.status(estado).json({
    ok: false,
    mensaje
  });
}

// COMPROBAR EL GRUPO Y SU FECHA DE INGRESO
async function grupoValido(
  grupoId,
  fechaMovimiento,
  session
) {
  const grupo = await GrupoGallinas
    .findById(id(grupoId))
    .session(session)
    .lean();

  if (!grupo) {
    throw fallo(
      404,
      "Grupo de gallinas no encontrado."
    );
  }

  if (fechaMovimiento < dia(grupo.fechaInicio)) {
    throw fallo(
      400,
      "La fecha es anterior al ingreso del grupo."
    );
  }

  return grupo;
}

// GUARDAR HISTORIAL
async function auditar(
  req,
  accion,
  entidadId,
  antes,
  despues,
  session
) {
  await AuditoriaHuevos.create(
    [
      {
        usuario: req.usuarioCaja._id,
        accion,
        entidadId: String(entidadId),
        antes,
        despues
      }
    ],
    {
      session,
      ordered: true
    }
  );
}

// GUARDAR UNA OPERACIÓN COMPLETA SIN DUPLICAR REINTENTOS
export function escrituraHuevos(accion) {
  return async (req, res) => {
    let session;

    try {
      const clave = req.body?.claveOperacion;

      if (
        typeof clave !== "string" ||
        !/^[a-zA-Z0-9-]{16,100}$/.test(clave)
      ) {
        throw fallo(
          400,
          "Falta el identificador de la solicitud."
        );
      }

      const firma = JSON.stringify({
        ruta: req.originalUrl.split("?")[0],
        metodo: req.method,
        cuerpo: req.body
      });

      const operacionId = createHash("sha256")
        .update(`${req.usuarioCaja._id}:${clave}`)
        .digest("hex");

      session = await mongoose.startSession();

      let respuesta;

      await session.withTransaction(
        async () => {
          const previa = await OperacionHuevos
            .findById(operacionId)
            .session(session)
            .lean();

          if (previa) {
            if (previa.firma !== firma) {
              throw fallo(
                409,
                "La misma solicitud no puede reenviarse con datos diferentes."
              );
            }

            respuesta = {
              ...previa.respuesta,
              repetida: true
            };

            return;
          }

          if (req.path !== "/configuracion") {
            const config = await bloquearRegistroHuevos(
              session
            );

            if (!config) {
              throw fallo(
                409,
                "El administrador debe configurar primero los productos de huevos."
              );
            }
          }

          respuesta = await accion(req, session);

          await OperacionHuevos.create(
            [
              {
                _id: operacionId,
                firma,
                usuario: req.usuarioCaja._id,
                respuesta
              }
            ],
            {
              session,
              ordered: true
            }
          );
        },
        {
          readConcern: {
            level: "snapshot"
          },
          writeConcern: {
            w: "majority"
          }
        }
      );

      return res.json(respuesta);
    } catch (error) {
      return errorRespuesta(res, error);
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // Conservar el resultado de la operación confirmada.
        }
      }
    }
  };
}
// CONSULTAR LA CONFIGURACIÓN
export async function obtenerConfiguracionHuevos(req, res) {
  try {
    comprobarAcceso(
      req,
      req.query.sede || "TIENDITA"
    );

    return res.json({
      ok: true,
      configuracion: await configuracionHuevos(),
      esAdministrador:
        req.usuarioCaja.rol === "ADMINISTRADOR"
    });
  } catch (error) {
    return errorRespuesta(res, error);
  }
}

// CONSULTAR GRUPOS, MOVIMIENTOS Y EXISTENCIAS
export async function consultarHuevos(req, res) {
  let session;

  try {
    const sede = req.query.sede || "MONASTERIO";

    comprobarAcceso(req, sede);

    const fechaConsulta = fecha(
      req.query.fecha || hoy()
    );

    session = await mongoose.startSession();

    let respuesta;

    await session.withTransaction(async () => {
      const config = await configuracionHuevos(session);

      if (!config) {
        respuesta = {
          ok: true,
          esAdministrador:
            req.usuarioCaja.rol === "ADMINISTRADOR",
          configuracion: null,
          grupos: [],
          movimientos: [],
          conceptos: CONCEPTOS_HUEVOS
        };

        return;
      }

      const registro = await cargarRegistroHuevos(session);

      const general = await stockGeneralHuevos(
        config,
        sede,
        session
      );

      const totalConGrupo = registro.eventos
        .filter((evento) => evento.sede === sede)
        .reduce(
          (suma, evento) => suma + evento.unidades,
          0
        );

      if (totalConGrupo > general.unidades) {
        throw fallo(
          409,
          "La existencia general y la existencia por grupos " +
          "no coinciden. El administrador debe revisar " +
          "los movimientos antes de continuar."
        );
      }

      respuesta = {
        ok: true,
        esAdministrador:
          req.usuarioCaja.rol === "ADMINISTRADOR",
        configuracion: config,
        sede,
        fecha: fechaConsulta,
        conceptos: CONCEPTOS_HUEVOS,

        producto: {
          _id: general.producto._id,
          codigo: general.producto.codigo,
          descripcion: general.producto.descripcion
        },

        existenciaTotalHuevos: general.unidades,
        existenciaSinGrupo:
          general.unidades - totalConGrupo,

        grupos: registro.grupos.map((grupo) => ({
          ...grupo,

          gallinasActuales: gallinasDisponibles(
            grupo,
            registro.movimientos
          ),

          disponibles: disponiblesDesde(
            registro.eventos,
            sede,
            grupo._id,
            fechaConsulta
          )
        })),

        movimientos: registro.movimientos
          .filter(
            (movimiento) =>
              sede === "MONASTERIO" ||
              movimiento.sede === "TIENDITA" ||
              movimiento.tipo === "ENVIO"
          )
          .sort(
            (a, b) =>
              new Date(b.fecha) - new Date(a.fecha) ||
              String(b._id).localeCompare(String(a._id))
          )
      };
    });

    return res.json(respuesta);
  } catch (error) {
    return errorRespuesta(res, error);
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

// CONFIGURACIÓN INICIAL — SOLO ADMINISTRADOR
export async function configurarHuevos(req, session) {
  administrador(req);
  comprobarAcceso(req, "MONASTERIO");
  comprobarAcceso(req, "TIENDITA");

  if (req.body.confirmarCartones !== true) {
    throw fallo(
      400,
      "Confirme que ambos productos se manejan en cartones de 30."
    );
  }

  if (await configuracionHuevos(session)) {
    throw fallo(
      409,
      "La configuración ya existe. No se cambia " +
      "automáticamente para conservar el historial."
    );
  }

  const productoMonasterioId = id(
    req.body.productoMonasterioId
  );

  const productoTienditaId = id(
    req.body.productoTienditaId
  );

  if (productoMonasterioId === productoTienditaId) {
    throw fallo(
      400,
      "Seleccione un producto de cada sede."
    );
  }

  const actividadProductiva = id(
    req.body.actividadProductiva
  );

  const actividad = await Actividad
    .findById(actividadProductiva)
    .session(session)
    .lean();

  if (!actividad || actividad.activa === false) {
    throw fallo(
      400,
      "Seleccione una actividad productiva activa."
    );
  }

  const productosPorSede = [
    [productoMonasterioId, "MONASTERIO"],
    [productoTienditaId, "TIENDITA"]
  ];

  for (const [productoId, sede] of productosPorSede) {
    const producto = await Producto
      .findById(productoId)
      .session(session)
      .lean();

    if (
      !producto ||
      (producto.sede || "TIENDITA") !== sede ||
      producto.origen !== "PRODUCCION_MONASTERIO"
    ) {
      throw fallo(
        400,
        `Seleccione en ${sede} un producto de producción del Monasterio.`
      );
    }
  }

  const config = {
    _id: "HUEVOS",

    fechaInicioControl: new Date(
      `${hoy()}T00:00:00.000Z`
    ),

    productoMonasterioId,
    productoTienditaId,
    actividadProductiva,
    creadoPor: req.usuarioCaja._id
  };

  for (const sede of ["MONASTERIO", "TIENDITA"]) {
    await stockGeneralHuevos(
      config,
      sede,
      session
    );
  }

  await ConfiguracionHuevos.create(
    [config],
    {
      session,
      ordered: true
    }
  );

  await auditar(
    req,
    "CONFIGURAR",
    "HUEVOS",
    null,
    config,
    session
  );

  return {
    ok: true,
    mensaje:
      "Productos vinculados. No se modificaron " +
      "existencias ni movimientos anteriores."
  };
}

// CREAR O MODIFICAR UN GRUPO
export async function guardarGrupo(req, session) {
  comprobarAcceso(req, "MONASTERIO");

  const nombre = texto(req.body.nombre, 120);
  const fechaInicio = fecha(req.body.fechaInicio);

  if (!nombre) {
    throw fallo(
      400,
      "Indique el nombre del grupo."
    );
  }

  const cantidadInicial = entero(
    req.body.cantidadInicial,
    "Gallinas iniciales",
    1
  );

  const observaciones = texto(
    req.body.observaciones
  );

  let grupo;

  if (req.params.id) {
    administrador(req);

    grupo = await GrupoGallinas
      .findById(id(req.params.id))
      .session(session);

    if (!grupo) {
      throw fallo(404, "Grupo no encontrado.");
    }

    if (grupo.__v !== req.body.versionEsperada) {
      throw fallo(
        409,
        "El grupo cambió. Actualice."
      );
    }

    const relacionado =
      await MovimientoHuevos
        .exists({ grupoId: grupo._id })
        .session(session) ||

      await Gastos
        .exists({
          "asignacionesGallinas.grupoId": grupo._id
        })
        .session(session) ||

      await Vendidos
        .exists({
          "asignacionesHuevos.grupoId": grupo._id
        })
        .session(session);

    if (
      relacionado &&
      (
        dia(grupo.fechaInicio) !== fechaInicio ||
        grupo.cantidadInicial !== cantidadInicial
      )
    ) {
      throw fallo(
        409,
        "El grupo tiene movimientos. Solo puede " +
        "corregir nombre y observaciones."
      );
    }

    const antes = grupo.toObject();

    grupo.set({
      nombre,
      fechaInicio: new Date(
        `${fechaInicio}T00:00:00.000Z`
      ),
      cantidadInicial,
      observaciones
    });

    grupo.increment();

    await grupo.save({ session });

    await auditar(
      req,
      "MODIFICAR_GRUPO",
      grupo._id,
      antes,
      grupo.toObject(),
      session
    );
  } else {
    grupo = new GrupoGallinas({
      nombre,

      fechaInicio: new Date(
        `${fechaInicio}T00:00:00.000Z`
      ),

      cantidadInicial,
      observaciones,
      creadoPor: req.usuarioCaja._id
    });

    await grupo.save({ session });

    await auditar(
      req,
      "CREAR_GRUPO",
      grupo._id,
      null,
      grupo.toObject(),
      session
    );
  }

  return {
    ok: true,
    mensaje: "Grupo guardado correctamente."
  };
}

// ELIMINAR UN GRUPO SIN REGISTROS ASOCIADOS
export async function eliminarGrupo(req, session) {
  administrador(req);
  comprobarAcceso(req, "MONASTERIO");

  const grupo = await GrupoGallinas
    .findById(id(req.params.id))
    .session(session)
    .lean();

  if (!grupo) {
    throw fallo(404, "Grupo no encontrado.");
  }

  if (grupo.__v !== req.body.versionEsperada) {
    throw fallo(
      409,
      "El grupo cambió. Actualice."
    );
  }

  const relacionado =
    await MovimientoHuevos
      .exists({ grupoId: grupo._id })
      .session(session) ||

    await Gastos
      .exists({
        "asignacionesGallinas.grupoId": grupo._id
      })
      .session(session) ||

    await Vendidos
      .exists({
        "asignacionesHuevos.grupoId": grupo._id
      })
      .session(session);

  if (relacionado) {
    throw fallo(
      409,
      "El grupo tiene registros asociados y no se puede eliminar."
    );
  }

  await GrupoGallinas
    .deleteOne({ _id: grupo._id })
    .session(session);

  await auditar(
    req,
    "ELIMINAR_GRUPO",
    grupo._id,
    grupo,
    null,
    session
  );

  return {
    ok: true,
    mensaje: "Grupo eliminado."
  };
}
// CREAR O ACTUALIZAR LA ENTRADA/SALIDA ASOCIADA
async function sincronizarMovimiento(
  mov,
  config,
  session,
  anterior
) {
  const productoId = productoDeHuevos(
    config,
    mov.sede
  );

  const producto = await Producto
    .findById(productoId)
    .session(session)
    .lean();

  if (
    !producto ||
    (producto.sede || "TIENDITA") !== mov.sede
  ) {
    throw fallo(
      409,
      "El producto configurado necesita revisión."
    );
  }

  const base = {
    fecha: mov.fecha,
    categoria: producto.categoria,
    productoId,
    codigo: producto.codigo,
    cantidad: mov.unidades / 30,
    sede: mov.sede,
    cierre: "N",
    movimientoHuevosId: mov._id,
    grupoGallinasId: mov.grupoId,
    huevosUnidades: mov.unidades,
    observacion: `${mov.tipo} DE HUEVOS`
  };

  const guardar = async (Modelo, campo, cantidad) => {
    const anteriorId = anterior?.[campo];

    if (anteriorId) {
      const registro = await Modelo
        .findOne({
          _id: anteriorId,
          movimientoHuevosId: mov._id,
          cierre: { $ne: "S" }
        })
        .session(session);

      if (!registro) {
        throw fallo(
          409,
          "El movimiento asociado cambió o está cerrado."
        );
      }

      if (cantidad === 0) {
        await Modelo
          .deleteOne({ _id: registro._id })
          .session(session);

        mov[campo] = null;
      } else {
        registro.set(base);

        await registro.save({ session });

        mov[campo] = registro._id;
      }
    } else if (cantidad > 0) {
      const registro = new Modelo(base);

      await registro.save({ session });

      mov[campo] = registro._id;
    }
  };

  if (mov.tipo === "PRODUCCION") {
    await guardar(
      Entrada,
      "entradaId",
      mov.unidades
    );
  } else if (mov.tipo !== "BAJA") {
    await guardar(
      Salida,
      "salidaId",
      mov.unidades
    );
  }
}

// GUARDAR PRODUCCIÓN, BAJAS, CONSUMO, PÉRDIDAS O ENVÍOS
export async function guardarMovimiento(req, session) {
  const body = req.body;
  const tipo = body.tipo;

  const tiposPermitidos = [
    "PRODUCCION",
    "BAJA",
    "CONSUMO",
    "MERMA",
    "ENVIO"
  ];

  if (!tiposPermitidos.includes(tipo)) {
    throw fallo(
      400,
      "Tipo de registro inválido."
    );
  }

  const sede = body.sede || "MONASTERIO";

  comprobarAcceso(req, sede);

  if (
    ["PRODUCCION", "BAJA", "ENVIO"].includes(tipo) &&
    sede !== "MONASTERIO"
  ) {
    throw fallo(
      400,
      "Este registro corresponde al Monasterio."
    );
  }

  const fechaMovimiento = fecha(body.fecha);

  const grupo = await grupoValido(
    body.grupoId,
    fechaMovimiento,
    session
  );

  await abierto(
    fechaMovimiento,
    sede,
    session
  );

  const config = await configuracionHuevos(session);

  if (
    tipo !== "BAJA" &&
    fechaMovimiento < dia(config.fechaInicioControl)
  ) {
    throw fallo(
      400,
      "Registre producción y movimientos nuevos desde " +
      "la activación del módulo. Los movimientos " +
      "anteriores no se vuelven a ingresar."
    );
  }

  const registro = await cargarRegistroHuevos(session);

  let anterior = null;
  let mov;

  // CORREGIR UN REGISTRO EXISTENTE
  if (req.params.id) {
    administrador(req);

    mov = await MovimientoHuevos
      .findById(id(req.params.id))
      .session(session);

    if (!mov) {
      throw fallo(
        404,
        "Registro no encontrado."
      );
    }

    if (mov.__v !== body.versionEsperada) {
      throw fallo(
        409,
        "El registro cambió. Actualice."
      );
    }

    if (mov.tipo === "ENVIO" && mov.recepcion) {
      throw fallo(
        409,
        "El envío ya fue recibido. Corrija la " +
        "recepción en Tiendita si corresponde."
      );
    }

    if (
      mov.tipo !== tipo ||
      String(mov.grupoId) !== String(grupo._id) ||
      mov.sede !== sede
    ) {
      throw fallo(
        400,
        "No cambie el tipo, el grupo ni la sede al corregir."
      );
    }

    anterior = mov.toObject();

    await abierto(
      dia(mov.fecha),
      sede,
      session
    );
  } else {
    mov = new MovimientoHuevos({
      grupoId: grupo._id,
      tipo,
      sede,
      usuario: req.usuarioCaja._id
    });
  }

  let unidades;
  let recogidos;
  let descartados;

  // PRODUCCIÓN DIARIA
  if (tipo === "PRODUCCION") {
    recogidos = entero(
      body.recogidos,
      "Huevos recogidos"
    );

    descartados = entero(
      body.descartados,
      "Descartados"
    );

    try {
      unidades = produccionHuevos(
        recogidos,
        descartados
      ).aptos;
    } catch (error) {
      throw fallo(400, error.message);
    }

    const yaRegistrada = await MovimientoHuevos
      .exists({
        grupoId: grupo._id,
        tipo,
        fecha: new Date(
          `${fechaMovimiento}T00:00:00.000Z`
        ),
        _id: { $ne: mov._id }
      })
      .session(session);

    if (yaRegistrada) {
      throw fallo(
        409,
        "Ya hay producción de ese grupo y día. " +
        "Corrija el registro existente."
      );
    }

    const bajasPrevias = registro.movimientos
      .filter(
        (movimiento) =>
          movimiento.tipo === "BAJA" &&
          String(movimiento.grupoId) === String(grupo._id) &&
          dia(movimiento.fecha) < fechaMovimiento
      )
      .reduce(
        (suma, movimiento) =>
          suma + movimiento.unidades,
        0
      );

    if (grupo.cantidadInicial <= bajasPrevias) {
      throw fallo(
        409,
        "No hay gallinas en ese grupo para registrar " +
        "producción en esa fecha."
      );
    }
  } else {
    unidades = entero(
      body.unidades,
      "Cantidad",
      1
    );
  }

  // LOS ENVÍOS SE PREPARAN EN CARTONES O MEDIOS CARTONES
  if (
    tipo === "ENVIO" &&
    unidades % 15 !== 0
  ) {
    throw fallo(
      400,
      "El envío se prepara en cartones de 30 " +
      "o medios cartones de 15."
    );
  }

  const motivo = texto(body.motivo);
  const observaciones = texto(body.observaciones);

  if (
    ["BAJA", "CONSUMO", "MERMA"].includes(tipo) &&
    !motivo
  ) {
    throw fallo(
      400,
      "Indique el motivo o destino."
    );
  }

  mov.set({
    fecha: new Date(
      `${fechaMovimiento}T00:00:00.000Z`
    ),
    unidades,
    recogidos,
    descartados,
    motivo,
    observaciones
  });

  // COMPROBAR EL RESULTADO ANTES DE GUARDAR
  const candidatos = registro.movimientos.filter(
    (movimiento) =>
      String(movimiento._id) !== String(mov._id)
  );

  candidatos.push(mov.toObject());

  try {
    gallinasDisponibles(
      grupo,
      candidatos
    );

    validarProduccionGallinas(
      grupo,
      candidatos
    );

    validarExistencias(
      eventosHuevos(
        candidatos,
        registro.vendidos
      )
    );
  } catch (error) {
    throw fallo(409, error.message);
  }

  // COMPROBAR TAMBIÉN EL INVENTARIO GENERAL
  if (
    ["CONSUMO", "MERMA", "ENVIO"].includes(tipo)
  ) {
    const general = await stockGeneralHuevos(
      config,
      sede,
      session
    );

    const recuperado = anterior
      ? anterior.unidades
      : 0;

    if (unidades > general.unidades + recuperado) {
      throw fallo(
        409,
        "La existencia general de huevos no cubre el retiro."
      );
    }
  }

  await sincronizarMovimiento(
    mov,
    config,
    session,
    anterior
  );

  if (anterior) {
    mov.increment();
  }

  await mov.save({ session });

  await auditar(
    req,
    anterior
      ? "MODIFICAR_MOVIMIENTO"
      : "CREAR_MOVIMIENTO",
    mov._id,
    anterior,
    mov.toObject(),
    session
  );

  return {
    ok: true,
    mensaje: tipo === "ENVIO"
      ? "Envío registrado. Queda pendiente la recepción en Tiendita."
      : "Registro guardado correctamente.",
    id: mov._id
  };
}

// ELIMINAR UN REGISTRO — SOLO ADMINISTRADOR
export async function eliminarMovimiento(req, session) {
  administrador(req);

  const mov = await MovimientoHuevos
    .findById(id(req.params.id))
    .session(session)
    .lean();

  if (!mov) {
    throw fallo(
      404,
      "Registro no encontrado."
    );
  }

  comprobarAcceso(req, mov.sede);

  if (mov.__v !== req.body.versionEsperada) {
    throw fallo(
      409,
      "El registro cambió. Actualice."
    );
  }

  if (mov.tipo === "ENVIO" && mov.recepcion) {
    throw fallo(
      409,
      "No se elimina un envío que ya tiene recepción."
    );
  }

  await abierto(
    dia(mov.fecha),
    mov.sede,
    session
  );

  const registro = await cargarRegistroHuevos(session);

  const candidatos = registro.movimientos.filter(
    (movimiento) =>
      String(movimiento._id) !== String(mov._id)
  );

  const grupo = await GrupoGallinas
    .findById(mov.grupoId)
    .session(session)
    .lean();

  try {
    validarExistencias(
      eventosHuevos(
        candidatos,
        registro.vendidos
      )
    );

    gallinasDisponibles(
      grupo,
      candidatos
    );
  } catch (error) {
    throw fallo(409, error.message);
  }

  const asociados = [
    [Entrada, "entradaId"],
    [Salida, "salidaId"]
  ];

  for (const [Modelo, campo] of asociados) {
    if (!mov[campo]) continue;

    const resultado = await Modelo
      .deleteOne({
        _id: mov[campo],
        movimientoHuevosId: mov._id,
        cierre: { $ne: "S" }
      })
      .session(session);

    if (resultado.deletedCount !== 1) {
      throw fallo(
        409,
        "La entrada o salida asociada cambió o está cerrada."
      );
    }
  }

  await MovimientoHuevos
    .deleteOne({ _id: mov._id })
    .session(session);

  await auditar(
    req,
    "ELIMINAR_MOVIMIENTO",
    mov._id,
    mov,
    null,
    session
  );

  return {
    ok: true,
    mensaje:
      "Registro eliminado y existencia recalculada."
  };
}
// REGISTRAR O CORREGIR LA RECEPCIÓN EN TIENDITA
export async function recibirHuevos(req, session) {
  comprobarAcceso(req, "TIENDITA");

  const corrigiendo = req.method === "PUT";

  if (corrigiendo) {
    administrador(req);
  }

  const mov = await MovimientoHuevos
    .findById(id(req.params.id))
    .session(session);

  if (!mov || mov.tipo !== "ENVIO") {
    throw fallo(
      404,
      "Envío no encontrado."
    );
  }

  if (mov.recepcion && !corrigiendo) {
    throw fallo(
      409,
      "Ese envío ya fue recibido. Actualice la lista."
    );
  }

  if (!mov.recepcion && corrigiendo) {
    throw fallo(
      409,
      "Ese envío aún no tiene recepción."
    );
  }

  if (mov.__v !== req.body.versionEsperada) {
    throw fallo(
      409,
      "El envío cambió. Actualice."
    );
  }

  const fechaRecepcion = fecha(req.body.fecha);

  if (fechaRecepcion < dia(mov.fecha)) {
    throw fallo(
      400,
      "La recepción no puede ser anterior al envío."
    );
  }

  if (req.body.revisado !== true) {
    throw fallo(
      400,
      "Marque el envío como revisado."
    );
  }

  const recibidos = entero(
    req.body.recibidos,
    "Recibidos"
  );

  const partidos = entero(
    req.body.partidos,
    "Partidos"
  );

  const faltantes = entero(
    req.body.faltantes,
    "Faltantes"
  );

  const motivo = texto(req.body.motivo);
  const observaciones = texto(req.body.observaciones);

  try {
    recepcionHuevos(
      mov.unidades,
      recibidos,
      partidos,
      faltantes,
      motivo
    );
  } catch (error) {
    throw fallo(400, error.message);
  }

  await abierto(
    fechaRecepcion,
    "TIENDITA",
    session
  );

  const antes = mov.toObject();
  const anterior = antes.recepcion;

  if (anterior) {
    await abierto(
      dia(anterior.fecha),
      "TIENDITA",
      session
    );
  }

  const config = await configuracionHuevos(session);

  const producto = await Producto
    .findOne({
      _id: config.productoTienditaId,
      $or: [
        { sede: "TIENDITA" },
        { sede: { $exists: false } }
      ]
    })
    .session(session)
    .lean();

  if (!producto) {
    throw fallo(
      409,
      "El producto de Tiendita ya no existe."
    );
  }

  const registro = await cargarRegistroHuevos(session);

  const propuesta = {
    ...antes,
    recepcion: {
      fecha: new Date(
        `${fechaRecepcion}T00:00:00.000Z`
      ),
      recibidos,
      partidos,
      faltantes
    }
  };

  const candidatos = registro.movimientos.filter(
    (movimiento) =>
      String(movimiento._id) !== String(mov._id)
  );

  candidatos.push(propuesta);

  try {
    validarExistencias(
      eventosHuevos(
        candidatos,
        registro.vendidos
      )
    );
  } catch (error) {
    throw fallo(409, error.message);
  }

  const general = await stockGeneralHuevos(
    config,
    "TIENDITA",
    session
  );

  if (
    general.unidades +
    recibidos -
    (anterior?.recibidos || 0) < 0
  ) {
    throw fallo(
      409,
      "La corrección deja una existencia general negativa."
    );
  }

  const campos = {
    fecha: new Date(
      `${fechaRecepcion}T00:00:00.000Z`
    ),
    productoId: producto._id,
    codigo: producto.codigo,
    categoria: producto.categoria,
    cantidad: recibidos / 30,
    observacion:
      "RECEPCIÓN DE HUEVOS DEL MONASTERIO",
    sede: "TIENDITA",
    cierre: "N",
    grupoGallinasId: mov.grupoId,
    movimientoHuevosId: mov._id,
    huevosUnidades: recibidos
  };

  let entradaId = anterior?.entradaId || null;

  if (entradaId) {
    const entrada = await Entrada
      .findOne({
        _id: entradaId,
        movimientoHuevosId: mov._id,
        cierre: { $ne: "S" }
      })
      .session(session);

    if (!entrada) {
      throw fallo(
        409,
        "La entrada asociada cambió o está cerrada."
      );
    }

    if (recibidos > 0) {
      entrada.set(campos);

      await entrada.save({ session });
    } else {
      await Entrada
        .deleteOne({ _id: entrada._id })
        .session(session);

      entradaId = null;
    }
  } else if (recibidos > 0) {
    const entrada = new Entrada(campos);

    await entrada.save({ session });

    entradaId = entrada._id;
  }

  mov.recepcion = {
    fecha: campos.fecha,
    recibidos,
    partidos,
    faltantes,
    motivo,
    observaciones,
    usuario: req.usuarioCaja._id,
    entradaId
  };

  mov.increment();

  await mov.save({ session });

  await auditar(
    req,
    corrigiendo
      ? "CORREGIR_RECEPCION"
      : "RECIBIR_ENVIO",
    mov._id,
    antes,
    mov.toObject(),
    session
  );

  return {
    ok: true,
    mensaje: corrigiendo
      ? "Recepción corregida y existencia recalculada."
      : "Recepción confirmada. Solo los huevos aptos ingresaron a Tiendita."
  };
}

// CONSULTAR GASTOS ASIGNADOS A UN GRUPO
export async function gastosHuevos(req, res) {
  try {
    comprobarAcceso(req, "MONASTERIO");

    const grupoId = id(req.query.grupoId);

    const grupo = await GrupoGallinas
      .findById(grupoId)
      .lean();

    if (!grupo) {
      throw fallo(
        404,
        "Grupo no encontrado."
      );
    }

    const lista = await Gastos
      .find({
        "asignacionesGallinas.grupoId": grupoId
      })
      .sort({ fecha: -1 })
      .lean();

    for (const gasto of lista) {
      comprobarAcceso(
        req,
        gasto.sede || "TIENDITA"
      );
    }

    return res.json({
      ok: true,
      gastos: lista.map((gasto) => ({
        _id: gasto._id,
        version: gasto.__v || 0,
        fecha: gasto.fecha,
        descripcion: gasto.descripcion,
        sede: gasto.sede || "TIENDITA",
        moneda: gasto.moneda,

        asignacion: gasto.asignacionesGallinas.find(
          (asignacion) =>
            String(asignacion.grupoId) === grupoId
        )
      }))
    });
  } catch (error) {
    return errorRespuesta(res, error);
  }
}

// BUSCAR GASTOS EXISTENTES CON IMPORTE DISPONIBLE
export async function disponiblesGastosHuevos(req, res) {
  try {
    comprobarAcceso(req, "MONASTERIO");

    const sede = req.query.sede || "TIENDITA";

    comprobarAcceso(req, sede);

    const desde = fecha(req.query.desde);
    const hasta = fecha(req.query.hasta);

    if (
      desde > hasta ||
      new Date(hasta) - new Date(desde) >
        366 * 86400000
    ) {
      throw fallo(
        400,
        "Seleccione un período de hasta un año."
      );
    }

    const inicio = new Date(
      `${desde}T00:00:00.000Z`
    );

    const fin = new Date(
      `${hasta}T00:00:00.000Z`
    );

    fin.setUTCDate(fin.getUTCDate() + 1);

    const pagina = Number(
      req.query.pagina || 1
    );

    if (
      !Number.isSafeInteger(pagina) ||
      pagina < 1
    ) {
      throw fallo(
        400,
        "Página inválida."
      );
    }

    const filtroSede = sede === "MONASTERIO"
      ? { sede }
      : {
          $or: [
            { sede },
            { sede: { $exists: false } }
          ]
        };

    const lista = await Gastos
      .find({
        fecha: {
          $gte: inicio,
          $lt: fin
        },
        cierre: { $ne: "S" },
        compraReventa: null,
        clasificacion: {
          $ne: "COMPRA_REVENTA"
        },
        ...filtroSede
      })
      .sort({ fecha: -1, _id: -1 })
      .skip((pagina - 1) * 50)
      .limit(51)
      .lean();

    const gastos = lista
      .slice(0, 50)
      .map((gasto) => {
        const asignaciones = [
          ...(gasto.asignacionesLotes || []),
          ...(gasto.asignacionesGallinas || [])
        ];

        const usado = asignaciones.reduce(
          (suma, asignacion) =>
            suma +
            Math.round(
              asignacion.montoAsignado * 100
            ),
          0
        );

        return {
          _id: gasto._id,
          fecha: gasto.fecha,
          descripcion: gasto.descripcion,
          moneda: gasto.moneda,
          monto: gasto.monto,
          disponible:
            (
              Math.round(gasto.monto * 100) -
              usado
            ) / 100
        };
      })
      .filter(
        (gasto) => gasto.disponible > 0
      );

    return res.json({
      ok: true,
      gastos,
      pagina,
      hayMas: lista.length > 50
    });
  } catch (error) {
    return errorRespuesta(res, error);
  }
}
// REGISTRAR UN GASTO NUEVO O VINCULAR UNO EXISTENTE
export async function guardarGastoHuevos(req, session) {
  comprobarAcceso(req, "MONASTERIO");

  const body = req.body;
  const grupoId = id(body.grupoId);

  const montoCentavos = centavos(
    body.montoAsignado
  );

  if (!CONCEPTOS_HUEVOS.includes(body.concepto)) {
    throw fallo(
      400,
      "Concepto inválido."
    );
  }

  let gasto;

  if (body.gastoId) {
    // VINCULAR UN GASTO QUE YA FUE REGISTRADO
    gasto = await Gastos
      .findById(id(body.gastoId))
      .session(session);

    if (!gasto) {
      throw fallo(
        404,
        "Gasto no encontrado."
      );
    }

    if (
      gasto.cierre === "S" ||
      gasto.compraReventa ||
      gasto.clasificacion === "COMPRA_REVENTA"
    ) {
      throw fallo(
        409,
        "Ese gasto está cerrado o corresponde " +
        "a una compra para reventa."
      );
    }
  } else {
    // CREAR UN SOLO GASTO EN LA SEDE QUE PAGÓ
    const fechaGasto = fecha(body.fecha);
    const sedePagadora = body.sede;

    comprobarAcceso(req, sedePagadora);

    if (!["D", "P", "Bs"].includes(body.moneda)) {
      throw fallo(
        400,
        "Moneda inválida."
      );
    }

    const monto = centavos(body.monto) / 100;
    const descripcion = texto(body.descripcion);

    if (
      !descripcion ||
      typeof body.cajaChica !== "boolean"
    ) {
      throw fallo(
        400,
        "Complete la descripción y el origen del dinero."
      );
    }

    const numeroRecibo = texto(
      body.numeroRecibo,
      100
    );

    const filtroSede = sedePagadora === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    if (numeroRecibo) {
      const existe = await Gastos
        .exists({
          numeroRecibo,
          cierre: { $ne: "S" },
          ...filtroSede
        })
        .session(session);

      if (existe) {
        throw fallo(
          409,
          "Ya existe un gasto con ese recibo " +
          "en la sede. Vincule el existente."
        );
      }
    }

    const config = await configuracionHuevos(session);

    gasto = new Gastos({
      fecha: new Date(
        `${fechaGasto}T00:00:00.000Z`
      ),
      sede: sedePagadora,
      descripcion,
      monto,
      moneda: body.moneda,
      numeroRecibo,
      cajaChica: body.cajaChica,
      usuario:
        req.usuarioCaja.nombre ||
        req.usuarioCaja.usuario,
      clasificacion: "COSTO_PRODUCCION",
      actividadProductiva:
        config.actividadProductiva,
      cierre: "N"
    });
  }

  const sede = gasto.sede || "TIENDITA";

  comprobarAcceso(req, sede);

  const fechaGasto = dia(gasto.fecha);

  const existeGrupo = await GrupoGallinas
    .exists({ _id: grupoId })
    .session(session);

  if (!existeGrupo) {
    throw fallo(
      404,
      "Grupo no encontrado."
    );
  }

  await abierto(
    fechaGasto,
    sede,
    session
  );

  const yaAsignado = (
    gasto.asignacionesGallinas || []
  ).some(
    (asignacion) =>
      String(asignacion.grupoId) === grupoId
  );

  if (yaAsignado) {
    throw fallo(
      409,
      "Ese gasto ya está vinculado al grupo."
    );
  }

  // CONTAR TODAS LAS ASIGNACIONES DEL MISMO GASTO
  const asignacionesExistentes = [
    ...(gasto.asignacionesLotes || []),
    ...(gasto.asignacionesGallinas || [])
  ];

  const asignado = asignacionesExistentes.reduce(
    (suma, asignacion) =>
      suma +
      Math.round(
        asignacion.montoAsignado * 100
      ),
    0
  );

  if (
    asignado + montoCentavos >
    Math.round(gasto.monto * 100)
  ) {
    throw fallo(
      409,
      "La asignación supera el importe disponible del gasto."
    );
  }

  const antes = gasto.isNew
    ? null
    : gasto.toObject();

  gasto.asignacionesGallinas = [
    ...(gasto.asignacionesGallinas || []),
    {
      grupoId,
      concepto: body.concepto,
      montoAsignado: montoCentavos / 100,
      asignadoPor: req.usuarioCaja._id,
      fechaAsignacion: new Date()
    }
  ];

  gasto.increment();

  await gasto.save({ session });

  await auditar(
    req,
    "ASIGNAR_GASTO",
    gasto._id,
    antes,
    gasto.toObject(),
    session
  );

  return {
    ok: true,
    mensaje: body.gastoId
      ? "Gasto vinculado sin registrar otro pago."
      : "Gasto registrado una sola vez en la sede que pagó."
  };
}

// RETIRAR LA ASIGNACIÓN SIN BORRAR EL GASTO ORIGINAL
export async function desvincularGastoHuevos(
  req,
  session
) {
  administrador(req);
  comprobarAcceso(req, "MONASTERIO");

  const grupoId = id(req.body.grupoId);

  const gasto = await Gastos
    .findById(id(req.params.id))
    .session(session);

  if (!gasto) {
    throw fallo(
      404,
      "Gasto no encontrado."
    );
  }

  if (
    (gasto.__v || 0) !== req.body.versionEsperada
  ) {
    throw fallo(
      409,
      "El gasto cambió. Actualice la lista."
    );
  }

  const sede = gasto.sede || "TIENDITA";

  comprobarAcceso(req, sede);

  if (gasto.cierre === "S") {
    throw fallo(
      423,
      "El gasto pertenece a un mes cerrado."
    );
  }

  await abierto(
    dia(gasto.fecha),
    sede,
    session
  );

  const existeAsignacion = (
    gasto.asignacionesGallinas || []
  ).some(
    (asignacion) =>
      String(asignacion.grupoId) === grupoId
  );

  if (!existeAsignacion) {
    throw fallo(
      409,
      "No se encontró la asignación al grupo."
    );
  }

  const antes = gasto.toObject();

  gasto.asignacionesGallinas =
    gasto.asignacionesGallinas.filter(
      (asignacion) =>
        String(asignacion.grupoId) !== grupoId
    );

  gasto.increment();

  await gasto.save({ session });

  await auditar(
    req,
    "DESVINCULAR_GASTO",
    gasto._id,
    antes,
    gasto.toObject(),
    session
  );

  return {
    ok: true,
    mensaje:
      "Asignación retirada. El gasto y el pago original se conservan."
  };
}
// INFORME DE PRODUCCIÓN, VENTAS, COBROS Y GASTOS
// SOLO ADMINISTRADOR
export async function informeHuevos(req, res) {
  let session;

  try {
    administrador(req);
    comprobarAcceso(req, "MONASTERIO");
    comprobarAcceso(req, "TIENDITA");

    const desde = fecha(req.query.desde);
    const hasta = fecha(req.query.hasta);

    if (desde > hasta) {
      throw fallo(
        400,
        "Rango de fechas inválido."
      );
    }

    const grupoFiltro = req.query.grupoId
      ? id(req.query.grupoId)
      : null;

    const sedeFiltro = req.query.sede || "TODAS";

    if (
      !["TODAS", "MONASTERIO", "TIENDITA"].includes(sedeFiltro)
    ) {
      throw fallo(
        400,
        "Sede inválida."
      );
    }

    session = await mongoose.startSession();

    let respuesta;

    await session.withTransaction(async () => {
      const {
        grupos,
        movimientos,
        vendidos,
        eventos
      } = await cargarRegistroHuevos(session);

      const seleccion = grupos.filter(
        (grupo) =>
          !grupoFiltro ||
          String(grupo._id) === grupoFiltro
      );

      const gastos = await Gastos
        .find({
          "asignacionesGallinas.0": {
            $exists: true
          }
        })
        .session(session)
        .lean();

      const inicio = new Date(
        `${desde}T00:00:00.000Z`
      );

      const fin = new Date(
        `${hasta}T00:00:00.000Z`
      );

      fin.setUTCDate(fin.getUTCDate() + 1);

      const tasas = await Tasas
        .find({
          fecha: {
            $gte: inicio,
            $lt: fin
          }
        })
        .session(session)
        .lean();

      const enRango = (valor) =>
        dia(valor) >= desde &&
        dia(valor) <= hasta;

      const sedeElegida = (sede) =>
        sedeFiltro === "TODAS" ||
        sede === sedeFiltro;

      // COBROS REALIZADOS DURANTE EL PERÍODO
      const movimientosCobro = await Moneda
        .find({
          fecha: {
            $gte: inicio,
            $lt: fin
          }
        })
        .session(session)
        .lean();

      const facturasCobro = [
        ...new Set(
          movimientosCobro.map(
            (movimiento) => movimiento.factura
          )
        )
      ];

      const detalleCobros = await Vendidos
        .find({
          factura: {
            $in: facturasCobro
          }
        })
        .session(session)
        .lean();

      const cobros = cobrosPorGrupoHuevos(
        movimientosCobro.filter(
          (movimiento) =>
            sedeElegida(
              movimiento.sede || "TIENDITA"
            )
        ),
        detalleCobros
      );

      const filas = seleccion.map((grupo) => {
        const grupoId = String(grupo._id);

        const fila = {
          grupoId,
          nombre: grupo.nombre,
          recogidos: 0,
          descartados: 0,
          producidos: 0,
          consumo: 0,
          mermas: 0,
          vendidos: 0,
          enTransito: 0,
          faltantesPorRevisar: 0,
          existenciaMonasterio: 0,
          existenciaTiendita: 0,
          ventasUSD: 0,

          cobrado: {
            D: 0,
            P: 0,
            Bs: 0
          },

          gastos: {
            D: 0,
            P: 0,
            Bs: 0
          },

          gastosUSD: 0,
          gastosSinTasa: 0
        };

        // PRODUCCIÓN, CONSUMO, PÉRDIDAS Y ENVÍOS
        const movimientosGrupo = movimientos.filter(
          (movimiento) =>
            String(movimiento.grupoId) === grupoId
        );

        for (const movimiento of movimientosGrupo) {
          if (
            enRango(movimiento.fecha) &&
            sedeElegida(movimiento.sede)
          ) {
            if (movimiento.tipo === "PRODUCCION") {
              fila.recogidos += movimiento.recogidos;
              fila.descartados += movimiento.descartados;
              fila.producidos += movimiento.unidades;
            }

            if (movimiento.tipo === "CONSUMO") {
              fila.consumo += movimiento.unidades;
            }

            if (movimiento.tipo === "MERMA") {
              fila.mermas += movimiento.unidades;
            }
          }

          if (movimiento.tipo === "ENVIO") {
            const pendienteAlFinal =
              dia(movimiento.fecha) <= hasta &&
              (
                !movimiento.recepcion ||
                dia(movimiento.recepcion.fecha) > hasta
              );

            if (pendienteAlFinal) {
              fila.enTransito += movimiento.unidades;
            }

            if (
              movimiento.recepcion &&
              enRango(movimiento.recepcion.fecha) &&
              sedeElegida("TIENDITA")
            ) {
              fila.mermas +=
                movimiento.recepcion.partidos;

              fila.faltantesPorRevisar +=
                movimiento.recepcion.faltantes;
            }
          }
        }

        // EXISTENCIA ACUMULADA HASTA EL FINAL DEL PERÍODO
        const eventosGrupo = eventos.filter(
          (evento) =>
            evento.grupoId === grupoId &&
            evento.fecha <= hasta
        );

        for (const evento of eventosGrupo) {
          if (evento.sede === "MONASTERIO") {
            fila.existenciaMonasterio += evento.unidades;
          } else {
            fila.existenciaTiendita += evento.unidades;
          }
        }

        // VENTAS FACTURADAS DURANTE EL PERÍODO
        const ventasPeriodo = vendidos.filter(
          (vendido) =>
            enRango(vendido.fechaVentaHuevos) &&
            sedeElegida(vendido.sede || "TIENDITA")
        );

        for (const vendido of ventasPeriodo) {
          const asignacion =
            vendido.asignacionesHuevos.find(
              (item) =>
                String(item.grupoId) === grupoId
            );

          if (asignacion) {
            fila.vendidos += asignacion.unidades;

            fila.ventasUSD +=
              vendido.total *
              asignacion.unidades /
              vendido.huevosUnidades;
          }
        }

        // GASTOS ASIGNADOS AL GRUPO
        // La sede que pagó puede ser distinta de la que produce.
        const gastosPeriodo = gastos.filter(
          (gasto) => enRango(gasto.fecha)
        );

        for (const gasto of gastosPeriodo) {
          const asignacion =
            gasto.asignacionesGallinas.find(
              (item) =>
                String(item.grupoId) === grupoId
            );

          if (!asignacion) continue;

          if (
            !["D", "P", "Bs"].includes(gasto.moneda)
          ) {
            fila.gastosSinTasa++;
            continue;
          }

          fila.gastos[gasto.moneda] +=
            asignacion.montoAsignado;

          let tasa = gasto.moneda === "D"
            ? 1
            : null;

          if (!tasa) {
            const coincidencias = tasas.filter(
              (registroTasa) =>
                dia(registroTasa.fecha) === dia(gasto.fecha) &&
                (registroTasa.sede || "TIENDITA") ===
                  (gasto.sede || "TIENDITA")
            );

            if (coincidencias.length === 1) {
              tasa = gasto.moneda === "P"
                ? coincidencias[0].tasaP
                : coincidencias[0].tasaD;
            }
          }

          if (!(Number(tasa) > 0)) {
            fila.gastosSinTasa++;
          } else {
            fila.gastosUSD +=
              asignacion.montoAsignado / tasa;
          }
        }

        // COBROS EN SU MONEDA ORIGINAL
        const cobrado = cobros.resultado.get(grupoId);

        if (cobrado) {
          for (const moneda of ["D", "P", "Bs"]) {
            fila.cobrado[moneda] =
              cobrado[moneda] / 100;
          }
        }

        // RESULTADO DEL PERÍODO
        fila.resultadoUSD =
          fila.gastosSinTasa ||
          sedeFiltro !== "TODAS"
            ? null
            : fila.ventasUSD - fila.gastosUSD;

        return fila;
      });

      respuesta = {
        ok: true,
        desde,
        hasta,
        sede: sedeFiltro,
        filas,

        observaciones: [
          ...cobros.avisos,

          "Los cobros incluyen abonos a crédito y descuentan " +
          "los vueltos; se reparten por el valor de los productos " +
          "de la factura, en cada moneda original. Los faltantes " +
          "al recibir quedan identificados para revisión, " +
          "separados de los huevos partidos.",

          "Las ventas son importes facturados netos de descuento, " +
          "antes del IVA; incluyen ventas a crédito. " +
          "No representan necesariamente dinero cobrado.",

          "El resultado compara ventas y gastos asignados del " +
          "período. No es una utilidad contable del inventario " +
          "vendido: incluye alimento, consumo y producción " +
          "pendiente de vender.",

          "Los traslados no son ventas. Los gastos se atribuyen " +
          "al grupo independientemente de la sede que pagó.",

          "Las existencias anteriores sin grupo y las ventas " +
          "históricas sin asignación no se atribuyen a grupos " +
          "nuevos. No se usan tasas actuales para completar " +
          "tasas históricas faltantes.",

          ...(
            sedeFiltro !== "TODAS"
              ? [
                  "Con filtro por sede se muestran ventas y " +
                  "movimientos de esa sede; los costos pertenecen " +
                  "al grupo completo, por lo que no se calcula " +
                  "un resultado por sede."
                ]
              : []
          )
        ]
      };
    });

    return res.json(respuesta);
  } catch (error) {
    return errorRespuesta(res, error);
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