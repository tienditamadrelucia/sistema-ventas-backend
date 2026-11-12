import mongoose from "mongoose";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import { fallo } from "./controlCaja.js";

export const filtroSedeStock = sede =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

export async function saldoInventario(
  producto,
  sede,
  session,
  opciones = {}
) {
  const hasta = opciones.hasta
    ? new Date(opciones.hasta)
    : null;

  if (hasta && !Number.isFinite(hasta.getTime())) {
    throw fallo(400, "Fecha de inventario inválida.");
  }

  const aperturas = await mongoose.connection.db
    .collection("aperturasStockInventario")
    .find(
      {
        productoId: producto._id,
        sede
      },
      {
        session: session || undefined
      }
    )
    .toArray();

  const bases = [];

  for (const apertura of aperturas) {
    bases.push({
      fecha: new Date(apertura.fechaBase),
      stock: apertura.stockInicial,
      origen: "APERTURA_APLICADA"
    });

    bases.push({
      fecha: new Date(apertura.fechaOrigen),
      stock: apertura.stockOrigen,
      origen: "INVENTARIO_FISICO"
    });
  }

  const aplicables = bases
    .filter(base => !hasta || base.fecha <= hasta)
    .sort(
      (a, b) =>
        b.fecha - a.fecha ||
        (a.origen === "APERTURA_APLICADA" ? -1 : 1)
    );

  let stockInicial = Number(producto.stock ?? 0);
  let desde = null;

  if (aplicables.length) {
    stockInicial = aplicables[0].stock;
    desde = aplicables[0].fecha;
  } else if (aperturas.length) {
    const primera = [...aperturas].sort(
      (a, b) =>
        new Date(a.fechaBase) - new Date(b.fechaBase)
    )[0];

    stockInicial = primera.stockAnterior;
  }

  if (
    typeof stockInicial !== "number" ||
    !Number.isFinite(stockInicial)
  ) {
    throw fallo(
      409,
      "El stock inicial del producto no es válido."
    );
  }

  const fechas = {
    ...(desde ? { $gte: desde } : {}),
    ...(hasta ? { $lt: hasta } : {})
  };

  const filtro = {
    productoId: producto._id,
    ...filtroSedeStock(sede),
    ...(Object.keys(fechas).length
      ? { fecha: fechas }
      : {})
  };

  const entradas = await Entrada.find(filtro)
    .select("cantidad")
    .session(session || null)
    .lean();

  const salidas = await Salida.find(filtro)
    .select("cantidad")
    .session(session || null)
    .lean();

  function sumar(lista) {
    return lista.reduce((suma, fila) => {
      if (
        typeof fila.cantidad !== "number" ||
        !Number.isFinite(fila.cantidad)
      ) {
        throw fallo(
          409,
          "Hay cantidades inválidas en el inventario del producto."
        );
      }

      return suma + fila.cantidad;
    }, 0);
  }

  const filtroVendidos = {
    productoId: producto._id,
    ...filtroSedeStock(sede),
    descuentaInventario: { $ne: false }
  };

  if (
    opciones.excluirFactura !== undefined &&
    opciones.excluirFactura !== null
  ) {
    filtroVendidos.factura = {
      $ne: opciones.excluirFactura
    };
  }

  const vendidos = await Vendidos.aggregate([
    {
      $match: filtroVendidos
    },
    {
      $lookup: {
        from: Ventas.collection.name,

        let: {
          numero: "$factura"
        },

        pipeline: [
          {
            $match: {
              ...filtroSedeStock(sede),

              $expr: {
                $eq: ["$factura", "$$numero"]
              }
            }
          },
          {
            $project: {
              fecha: 1,
              tipoMovimiento: 1,
              estado: 1
            }
          }
        ],

        as: "cabeceras"
      }
    },
    {
      $project: {
        cantidad: 1,
        factura: 1,
        cabeceras: 1
      }
    }
  ]).session(session || null);

  const validos = [];
  const incidencias = [];

  for (const vendido of vendidos) {
    if (vendido.cabeceras.length !== 1) {
      incidencias.push(
        `Factura ${vendido.factura}: no tiene una cabecera única.`
      );

      continue;
    }

    const venta = vendido.cabeceras[0];
    const fecha = new Date(venta.fecha);

    if (
      venta.fecha == null ||
      !Number.isFinite(fecha.getTime())
    ) {
      incidencias.push(
        `Factura ${vendido.factura}: fecha inválida.`
      );

      continue;
    }

    if (venta.tipoMovimiento === "OTRO_INGRESO") {
      continue;
    }

    // Los créditos son encargos todavía sin entregar.
    if (venta.estado === "CREDITO") {
      continue;
    }

    if (desde && fecha < desde) {
      continue;
    }

    if (hasta && fecha >= hasta) {
      continue;
    }

    validos.push(vendido);
  }

  const totalEntradas = sumar(entradas);
  const totalSalidas = sumar(salidas);
  const totalVentas = sumar(validos);

  return {
    stockInicial,
    fechaBase: desde,
    totalEntradas,
    totalSalidas,
    totalVentas,

    stockReal: incidencias.length
      ? null
      : stockInicial +
        totalEntradas -
        totalSalidas -
        totalVentas,

    incidencias
  };
}