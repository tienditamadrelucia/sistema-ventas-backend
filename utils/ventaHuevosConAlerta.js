import {
  prepararVentaHuevos as prepararConSeguimiento,
  configuracionHuevos,
  productoDeHuevos,
  stockGeneralHuevos
} from "./inventarioHuevos.js";

import {
  unidadesCartones
} from "./registroHuevos.mjs";

const ERRORES_EXISTENCIA = new Set([
  "La existencia general y el control por grupos requieren revisión.",
  "No hay suficientes huevos para la factura completa.",
  "No hay suficientes huevos disponibles.",
  "La existencia anterior de huevos necesita revisión: debe representar huevos enteros y no ser negativa."
]);

export async function prepararVentaHuevos(datos) {
  // Los encargos sin entrega no consumen inventario.
  const reservadas = datos.lineas.filter(
    linea => linea.descuentaInventario === false
  );

  if (reservadas.length) {
    const config = await configuracionHuevos(
      datos.session
    );

    if (config) {
      const id = String(
        productoDeHuevos(config, datos.sede)
      );

      for (
        const linea of reservadas.filter(
          linea => String(linea.productoId) === id
        )
      ) {
        try {
          unidadesCartones(linea.cantidad);
        } catch (e) {
          const error = new Error(e.message);
          error.estado = 400;
          throw error;
        }
      }
    }
  }

  datos = {
    ...datos,

    lineas: datos.lineas.filter(
      linea => linea.descuentaInventario !== false
    ),

    anteriores: (datos.anteriores || []).filter(
      linea => linea.descuentaInventario !== false
    )
  };

  try {
    await prepararConSeguimiento(datos);
    return [];
  } catch (error) {
    // Solamente las diferencias de existencia
    // reconocidas se convierten en advertencias.
    if (
      error.estado !== 409 ||
      !ERRORES_EXISTENCIA.has(error.message)
    ) {
      throw error;
    }

    const config = await configuracionHuevos(
      datos.session
    );

    if (!config) throw error;

    const productoId = String(
      productoDeHuevos(config, datos.sede)
    );

    const lineas = datos.lineas.filter(
      linea =>
        String(linea.productoId) === productoId
    );

    if (!lineas.length) throw error;

    // Al editar, conservar las procedencias conocidas.
    const tieneProcedenciaHistorica = (
      datos.anteriores || []
    ).some(
      linea =>
        String(linea.productoId) === productoId &&
        (linea.asignacionesHuevos || []).some(
          asignacion => asignacion.grupoId
        )
    );

    if (tieneProcedenciaHistorica) {
      throw error;
    }

    const excluir =
      datos.factura === undefined ||
      datos.factura === null
        ? null
        : {
            factura: datos.factura,
            sede: datos.sede
          };

    const general = await stockGeneralHuevos(
      config,
      datos.sede,
      datos.session,
      excluir,
      {
        permitirNegativo: true
      }
    );

    let unidadesVendidas = 0;

    for (const linea of lineas) {
      let unidades;

      try {
        unidades = unidadesCartones(
          linea.cantidad
        );
      } catch (e) {
        const errorCantidad = new Error(e.message);
        errorCantidad.estado = 400;
        throw errorCantidad;
      }

      unidadesVendidas += unidades;

      if (!Number.isSafeInteger(unidadesVendidas)) {
        const errorCantidad = new Error(
          "La cantidad total de huevos supera el límite permitido."
        );

        errorCantidad.estado = 400;
        throw errorCantidad;
      }

      linea.actividadProductiva =
        config.actividadProductiva;

      linea.origenProducto =
        "PRODUCCION_MONASTERIO";

      linea.huevosUnidades = unidades;

      linea.fechaVentaHuevos = new Date(
        `${datos.fecha}T00:00:00.000Z`
      );

      // La procedencia queda pendiente de conciliación.
      linea.asignacionesHuevos = [
        {
          grupoId: null,
          unidades
        }
      ];
    }

    return [
      {
        codigo: general.producto.codigo,
        productoId,
        tipo: "INVENTARIO_PENDIENTE",
        fecha: datos.fecha,
        sede: datos.sede,

        existenciaAnterior:
          general.unidades / 30,

        cantidadVendida:
          unidadesVendidas / 30,

        existenciaPosterior:
          (general.unidades - unidadesVendidas) / 30,

        mensaje:
          `Producto ${general.producto.codigo}: ` +
          "venta registrada con inventario o " +
          "seguimiento por grupos pendiente " +
          "de conciliación. Comunique esta " +
          "alerta a la administradora."
      }
    ];
  }
}