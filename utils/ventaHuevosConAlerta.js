import {
  prepararVentaHuevos as prepararConSeguimiento,
  configuracionHuevos,
  productoDeHuevos,
  stockGeneralHuevos
} from "./inventarioHuevos.js";
import { unidadesCartones } from "./registroHuevos.mjs";
import { ConciliacionHuevos } from "../models/Huevos.js";

const ERRORES_EXISTENCIA = new Set([
  "La existencia general y el control por grupos requieren revisión.",
  "No hay suficientes huevos para la factura completa.",
  "No hay suficientes huevos disponibles.",
  "La existencia anterior de huevos necesita revisión: debe representar huevos enteros y no ser negativa."
]);

function validarCantidad(cantidad) {
  try {
    return unidadesCartones(cantidad);
  } catch (e) {
    const error = new Error(e.message);
    error.estado = 400;
    throw error;
  }
}

export async function prepararVentaHuevos(datos) {
  const config = await configuracionHuevos(datos.session);
  if (!config) return [];

  const productoId = String(productoDeHuevos(config, datos.sede));

  // VALIDAR ENCARGOS SIN DESCONTAR INVENTARIO
  for (const linea of datos.lineas) {
    if (linea.descuentaInventario === false &&
        String(linea.productoId) === productoId) {
      validarCantidad(linea.cantidad);
    }
  }

  datos = {
    ...datos,
    lineas: datos.lineas.filter(l => l.descuentaInventario !== false),
    anteriores: (datos.anteriores || []).filter(l => l.descuentaInventario !== false)
  };

  try {
    await prepararConSeguimiento(datos);
    return [];
  } catch (error) {
    if (error.estado !== 409 || !ERRORES_EXISTENCIA.has(error.message)) {
      throw error;
    }

    // NO PERMITIR NUEVAS DIFERENCIAS DESPUÉS DE CONCILIAR
    const conciliada = await ConciliacionHuevos.exists({
      sede: datos.sede,
      productoId
    }).session(datos.session || null);

    if (conciliada) throw error;

    const lineas = datos.lineas.filter(
      linea => String(linea.productoId) === productoId
    );

    if (!lineas.length) throw error;

    // CONSERVAR LAS PROCEDENCIAS HISTÓRICAS
    const tieneProcedenciaHistorica = datos.anteriores.some(
      linea => String(linea.productoId) === productoId &&
        (linea.asignacionesHuevos || []).some(a => a.grupoId)
    );

    if (tieneProcedenciaHistorica) throw error;

    const excluir = datos.factura == null
      ? null
      : { factura: datos.factura, sede: datos.sede };

    const general = await stockGeneralHuevos(
      config, datos.sede, datos.session, excluir,
      { permitirNegativo: true }
    );

    let unidadesVendidas = 0;

    for (const linea of lineas) {
      const unidades = validarCantidad(linea.cantidad);
      unidadesVendidas += unidades;

      if (!Number.isSafeInteger(unidadesVendidas)) {
        const errorCantidad = new Error(
          "La cantidad total de huevos supera el límite permitido."
        );
        errorCantidad.estado = 400;
        throw errorCantidad;
      }

      linea.actividadProductiva = config.actividadProductiva;
      linea.origenProducto = "PRODUCCION_MONASTERIO";
      linea.huevosUnidades = unidades;
      linea.fechaVentaHuevos = new Date(`${datos.fecha}T00:00:00.000Z`);
      linea.asignacionesHuevos = [{ grupoId: null, unidades }];
    }

    return [{
      codigo: general.producto.codigo,
      productoId,
      tipo: "INVENTARIO_PENDIENTE",
      fecha: datos.fecha,
      sede: datos.sede,
      existenciaAnterior: general.unidades / 30,
      cantidadVendida: unidadesVendidas / 30,
      existenciaPosterior: (general.unidades - unidadesVendidas) / 30,
      mensaje: `Producto ${general.producto.codigo}: ` +
        "venta registrada con inventario o seguimiento por grupos " +
        "pendiente de conciliación. Comunique esta alerta a la administradora."
    }];
  }
}