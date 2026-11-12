import mongoose from "mongoose";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import {
  comprobarAcceso,
  fallo
} from "../utils/controlCaja.js";
import {
  saldoInventario
} from "../utils/saldoInventario.js";
import {
  configuracionHuevos,
  productoDeHuevos,
  cargarRegistroHuevos
} from "../utils/inventarioHuevos.js";

export async function diagnosticoHuevos(req, res) {
  let session;

  try {
    if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
      throw fallo(
        403,
        "Esta consulta corresponde al administrador."
      );
    }

    const sede = req.query.sede || "TIENDITA";
    comprobarAcceso(req, sede);

    let respuesta;

    session = await mongoose.connection.startSession();

    await session.withTransaction(async () => {
      const config = await configuracionHuevos(session);

      if (!config) {
        throw fallo(404, "No hay configuración de huevos.");
      }

      const productoId = productoDeHuevos(config, sede);

      const filtroSede = sede === "MONASTERIO"
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
        .select("codigo descripcion stock medida")
        .session(session)
        .lean();

      if (!producto) {
        throw fallo(
          409,
          "El producto configurado no existe en esta sede."
        );
      }

      const filtro = {
        productoId,
        ...filtroSede
      };

      const entradas = await Entrada.find(filtro)
        .select("cantidad fecha movimientoHuevosId")
        .session(session)
        .lean();

      const salidas = await Salida.find(filtro)
  .select(
    "cantidad fecha observacion movimientoHuevosId"
  )
  .session(session)
  .lean();

      const ventas = await Vendidos.find(filtro)
        .select(
          "factura cantidad asignacionesHuevos huevosUnidades"
        )
        .session(session)
        .lean();

      const registro = await cargarRegistroHuevos(session);

      const sumar = lista =>
        lista.reduce(
          (suma, fila) => suma + Number(fila.cantidad),
          0
        );

      const saldoAplicable = await saldoInventario(
  {
    ...producto,
    _id: productoId
  },
  sede,
  session
);

const inicial = saldoAplicable.stockInicial;
const entradasCartones = saldoAplicable.totalEntradas;
const salidasCartones = saldoAplicable.totalSalidas;
const ventasCartones = saldoAplicable.totalVentas;
const general = saldoAplicable.stockReal;

      const eventos = registro.eventos.filter(
        evento => evento.sede === sede
      );

      const saldos = new Map();

      for (const evento of eventos) {
        if (!evento.grupoId) continue;

        const clave = String(evento.grupoId);

        saldos.set(
          clave,
          (saldos.get(clave) || 0) + evento.unidades
        );
      }

      const grupos = [...saldos].map(
        ([grupoId, huevos]) => ({
          grupoId,

          nombre:
            registro.grupos.find(
              grupo => String(grupo._id) === grupoId
            )?.nombre || "GRUPO NO ENCONTRADO",

          huevos
        })
      );

      const huevosGrupos = grupos.reduce(
        (suma, grupo) => suma + grupo.huevos,
        0
      );

      const esperadas = [];

      for (const mov of registro.movimientos) {
        if (
          mov.tipo === "PRODUCCION" &&
          mov.sede === sede &&
          mov.unidades > 0
        ) {
          esperadas.push({
            movimientoId: mov._id,
            entradaId: mov.entradaId,
            huevos: mov.unidades
          });
        }

        if (
          mov.tipo === "ENVIO" &&
          sede === "TIENDITA" &&
          mov.recepcion?.recibidos > 0
        ) {
          esperadas.push({
            movimientoId: mov._id,
            entradaId: mov.recepcion.entradaId,
            huevos: mov.recepcion.recibidos
          });
        }
      }

      const inconsistenciasEntradas = [];

      for (const esperada of esperadas) {
        const entrada = entradas.find(
          fila =>
            String(fila._id) === String(esperada.entradaId)
        );

        if (
          !entrada ||
          String(entrada.movimientoHuevosId) !==
            String(esperada.movimientoId) ||
          Math.abs(
            Number(entrada.cantidad) * 30 -
            esperada.huevos
          ) > 0.00001
        ) {
          inconsistenciasEntradas.push({
            ...esperada,
            cantidadCartonesRegistrada:
              entrada?.cantidad ?? null
          });
        }
      }

      const sinAsignacion = ventas.filter(
        venta => !venta.asignacionesHuevos?.length
      );

      const cabeceras = await Ventas.find({
  factura: {
    $in: [
      ...new Set(
        sinAsignacion.map(venta => venta.factura)
      )
    ]
  },
  ...filtroSede
})
  .select("factura fecha cierre")
  .session(session)
  .lean();

const desdeActivacion = new Date(
  config.fechaInicioControl
);

const ventasSinGrupoDesdeActivacion = [];
const ventasSinFechaUnica = [];

for (const venta of sinAsignacion) {
  const coincidencias = cabeceras.filter(
    cabecera =>
      cabecera.factura === venta.factura
  );

  if (coincidencias.length !== 1) {
    ventasSinFechaUnica.push({
      id: venta._id,
      factura: venta.factura,
      cantidad: venta.cantidad,
      coincidencias: coincidencias.length
    });
  } else if (
    new Date(coincidencias[0].fecha) >=
    desdeActivacion
  ) {
    ventasSinGrupoDesdeActivacion.push({
      id: venta._id,
      factura: venta.factura,
      cantidad: venta.cantidad,
      fecha: coincidencias[0].fecha,
      cierre:
        coincidencias[0].cierre || "SIN_CAMPO"
    });
  }
}

ventasSinGrupoDesdeActivacion.sort(
  (a, b) =>
    new Date(a.fecha) - new Date(b.fecha)
);

const salidasManualesDesdeActivacion =
  salidas.filter(
    salida =>
      !salida.movimientoHuevosId &&
      new Date(salida.fecha) >= desdeActivacion
  );

      respuesta = {
        ok: true,
        soloLectura: true,
        sede,

        producto: {
          id: String(productoId),
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          medida: producto.medida
        },

        activacion: config.fechaInicioControl,
        fechaBaseInventario: saldoAplicable.fechaBase,
        incidenciasInventario: saldoAplicable.incidencias,

        resumenCartones: {
          stockInicial: inicial,
          entradas: entradasCartones,
          salidas: salidasCartones,
          ventas: ventasCartones,
          existenciaGeneral: general
        },

        resumenHuevos: {
          existenciaGeneral:
            general === null
            ? null
            : Math.round(general * 30),

          saldoGrupos: huevosGrupos,

          diferenciaGeneralMenosGrupos:
            general === null
            ? null
            : Math.round(general * 30) - huevosGrupos
        },

        grupos,
        ventasSinGrupoDesdeActivacion,
        ventasSinFechaUnica,
        salidasManualesDesdeActivacion,
        inconsistenciasEntradas,

        ventasSinAsignacion: {
          renglones: sinAsignacion.length,
          cartones: sumar(sinAsignacion)
        },

        movimientosDelControl: registro.movimientos
  .filter(mov =>
    mov.sede === sede ||
    (
      sede === "TIENDITA" &&
      mov.tipo === "ENVIO" &&
      mov.recepcion
    )
  )
  .map(mov => ({
    id: mov._id,
    grupoId: mov.grupoId,
    tipo: mov.tipo,
    sede: mov.sede,
    fecha: mov.fecha,
    huevos: mov.unidades,

    recepcion: mov.recepcion
      ? {
          fecha: mov.recepcion.fecha,
          huevosRecibidos: mov.recepcion.recibidos,
          partidos: mov.recepcion.partidos,
          faltantes: mov.recepcion.faltantes
        }
      : null
  })),

entradasManualesDesdeActivacion: entradas.filter(
  entrada =>
    !entrada.movimientoHuevosId &&
    new Date(entrada.fecha) >=
      new Date(config.fechaInicioControl)
),

        aviso:
          "Las ventas antiguas sin asignación pueden " +
          "ser legítimas. Esta consulta no atribuye " +
          "la causa ni modifica registros."
      };
    }, {
      readConcern: { level: "snapshot" },
      readPreference: "primary"
    });

    return res.json(respuesta);
  } catch (error) {
    console.error(
      "Error consultando diagnóstico de huevos:",
      error
    );

    const mensaje = error.estado
      ? error.message
      : "No se pudo completar el diagnóstico de huevos.";

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
        // Conservar el resultado.
      }
    }
  }
}