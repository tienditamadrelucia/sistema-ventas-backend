import Producto from "../models/Producto.js";
import { saldoInventario } from "./saldoInventario.js";

export async function advertenciasInventarioVenta(
  lineas,
  sede,
  fecha,
  facturaAnterior,
  session
) {
  const cantidades = new Map();

  for (const linea of lineas) {
    // Los encargos sin entrega no afectan el inventario.
    if (linea.descuentaInventario === false) {
      continue;
    }

    const id = String(linea.productoId);

    cantidades.set(
      id,
      (cantidades.get(id) || 0) + linea.cantidad
    );
  }

  const finDia = new Date(
    `${fecha}T00:00:00.000Z`
  );

  finDia.setUTCDate(finDia.getUTCDate() + 1);

  const advertencias = [];

  for (const [id, cantidad] of cantidades) {
    const producto = await Producto.findById(id)
      .session(session)
      .lean();

    const opciones = {
      excluirFactura: facturaAnterior
    };

    const alDia = await saldoInventario(
      producto,
      sede,
      session,
      {
        ...opciones,
        hasta: finDia
      }
    );

    const actual = await saldoInventario(
      producto,
      sede,
      session,
      opciones
    );

    if (
      alDia.stockReal === null ||
      actual.stockReal === null
    ) {
      advertencias.push({
        codigo: producto.codigo,
        productoId: id,
        tipo: "EXISTENCIA_PENDIENTE",

        mensaje:
          `Producto ${producto.codigo}: ` +
          "no se pudo confirmar la existencia. " +
          "La venta se registra; comuníquelo " +
          "a la administradora."
      });

      continue;
    }

    const saldoFecha = alDia.stockReal - cantidad;
    const saldoActual = actual.stockReal - cantidad;

    if (
      saldoFecha < -0.0000001 ||
      saldoActual < -0.0000001
    ) {
      advertencias.push({
        codigo: producto.codigo,
        productoId: id,
        tipo: "STOCK_NEGATIVO",

        existenciaPosterior: saldoActual,
        existenciaFechaVenta: saldoFecha,

        mensaje:
          `Producto ${producto.codigo} ` +
          `(${producto.descripcion}): ` +
          "inventario negativo. " +
          "Saldo en la fecha de venta: " +
          `${Number(saldoFecha.toFixed(3))}; ` +
          "saldo actual: " +
          `${Number(saldoActual.toFixed(3))}. ` +
          "La venta se registra. " +
          "Comuníquelo a la administradora " +
          "para resolverlo."
      });
    }
  }

  return advertencias;
}