import Producto from "../models/Producto.js";

import {
  saldoInventario,
  filtroSedeStock
} from "../utils/saldoInventario.js";

import { fallo } from "../utils/controlCaja.js";

function fechaFin(valor) {
  if (!valor) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw fallo(400, "Fecha inválida.");
  }

  const fecha = new Date(
    `${valor}T00:00:00.000Z`
  );

  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== valor
  ) {
    throw fallo(400, "Fecha inválida.");
  }

  fecha.setUTCDate(fecha.getUTCDate() + 1);

  return fecha;
}

function sedeConsulta(req) {
  const sede = req.query.sede || "TIENDITA";

  if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
    throw fallo(400, "Sede inválida.");
  }

  return sede;
}

function responder(res, error) {
  console.error(
    "Consulta de stock con apertura:",
    error
  );

  const mensaje = error.estado
    ? error.message
    : "No se pudo consultar el inventario.";

  return res.status(error.estado || 500).json({
    ok: false,
    mensaje
  });
}

// EXISTENCIA DE UN PRODUCTO
export async function stockRealConApertura(
  req,
  res
) {
  try {
    const sede = sedeConsulta(req);
    const codigo = Number(req.params.codigo);

    if (!Number.isFinite(codigo)) {
      throw fallo(400, "Código inválido.");
    }

    const productos = await Producto.find({
      codigo,
      ...filtroSedeStock(sede)
    }).lean();

    if (productos.length !== 1) {
      throw fallo(
        404,
        "El producto no se encuentra de forma única en esta sede."
      );
    }

    const saldo = await saldoInventario(
      productos[0],
      sede,
      null,
      {
        hasta: fechaFin(req.query.fecha)
      }
    );

    return res.json({
      ok: true,
      sede,
      codigo,
      ...saldo,

      advertencia:
        saldo.stockReal < 0
          ? "Existencia negativa: comunicar a la administradora."
          : ""
    });
  } catch (error) {
    return responder(res, error);
  }
}

// INVENTARIO POR CATEGORÍA
export async function inventarioConApertura(
  req,
  res
) {
  try {
    const sede = sedeConsulta(req);

    const productos = await Producto.find({
      categoria: req.query.categoria,
      ...filtroSedeStock(sede)
    }).lean();

    const resultado = [];
    const hasta = fechaFin(req.query.fecha);

    for (const producto of productos) {
      const saldo = await saldoInventario(
        producto,
        sede,
        null,
        {
          hasta
        }
      );

      resultado.push({
        ...producto,
        stock: saldo.stockInicial,
        fechaBase: saldo.fechaBase,
        totalEntradas: saldo.totalEntradas,
        totalSalidas: saldo.totalSalidas,
        totalVendidos: saldo.totalVentas,
        stockReal: saldo.stockReal,
        incidencias: saldo.incidencias
      });
    }

    return res.json({
      ok: true,
      productos: resultado
    });
  } catch (error) {
    return responder(res, error);
  }
}

// REPORTE DE EXISTENCIAS AL FINAL DEL RANGO
export async function reporteInventarioConApertura(
  req,
  res
) {
  try {
    const sede = sedeConsulta(req);

    if (
      !req.query.desde ||
      !req.query.hasta ||
      req.query.desde > req.query.hasta
    ) {
      throw fallo(
        400,
        "Seleccione un rango de fechas válido."
      );
    }

    fechaFin(req.query.desde);

    const hasta = fechaFin(req.query.hasta);

    const productos = await Producto.find(
      filtroSedeStock(sede)
    )
      .sort({
        categoria: 1,
        codigo: 1
      })
      .lean();

    const resultado = [];

    for (const producto of productos) {
      const saldo = await saldoInventario(
        producto,
        sede,
        null,
        {
          hasta
        }
      );

      resultado.push({
        _id: producto._id,
        codigo: producto.codigo,
        categoria: producto.categoria,
        descripcion: producto.descripcion,
        costo: producto.costo,
        venta: producto.venta,

        stockReal:
          saldo.stockReal === null
            ? null
            : Math.round(saldo.stockReal * 1000) / 1000,

        fechaBase: saldo.fechaBase,
        incidencias: saldo.incidencias
      });
    }

    return res.json(resultado);
  } catch (error) {
    return responder(res, error);
  }
}