import mongoose from "mongoose";
import Producto from "../models/Producto.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";

import {
  saldoInventario,
  filtroSedeStock
} from "../utils/saldoInventario.js";

import { fallo } from "../utils/controlCaja.js";

export async function movimientosConApertura(req, res) {
  try {
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      throw fallo(400, "Sede inválida.");
    }

    if (!/^[a-f\d]{24}$/i.test(req.params.productoId)) {
      throw fallo(400, "Producto inválido.");
    }

    function convertir(valor) {
      if (
        typeof valor !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor)
      ) {
        throw fallo(400, "Seleccione las fechas.");
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

      return fecha;
    }

    const inicio = convertir(req.query.fechaInicio);
    const fin = convertir(req.query.fechaFin);

    if (inicio > fin) {
      throw fallo(400, "Rango de fechas inválido.");
    }

    fin.setUTCDate(fin.getUTCDate() + 1);

    const producto = await Producto.findOne({
      _id: new mongoose.Types.ObjectId(
        req.params.productoId
      ),
      ...filtroSedeStock(sede)
    }).lean();

    if (!producto) {
      throw fallo(
        404,
        "Producto no encontrado en esta sede."
      );
    }

    const previo = await saldoInventario(
      producto,
      sede,
      null,
      {
        hasta: inicio
      }
    );

    if (previo.stockReal === null) {
      throw fallo(
        409,
        "No se pudo confirmar el saldo anterior: " +
        "hay facturas pendientes de revisión."
      );
    }

    const filtro = {
      productoId: producto._id,
      ...filtroSedeStock(sede),
      fecha: {
        $gte: inicio,
        $lt: fin
      }
    };

    const entradas = await Entrada.find(filtro).lean();
    const salidas = await Salida.find(filtro).lean();

    const vendidos = await Vendidos.aggregate([
      {
        $match: {
          productoId: producto._id,
          descuentaInventario: { $ne: false },
          ...filtroSedeStock(sede)
        }
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
                estado: { $ne: "CREDITO" },

                $expr: {
                  $eq: ["$factura", "$$numero"]
                }
              }
            },
            {
              $project: {
                fecha: 1
              }
            }
          ],

          as: "cabeceras"
        }
      },
      {
        $match: {
          "cabeceras.0.fecha": {
            $gte: inicio,
            $lt: fin
          }
        }
      }
    ]);

    if (
      vendidos.some(fila =>
        fila.cabeceras.length !== 1
      )
    ) {
      throw fallo(
        409,
        "Hay facturas duplicadas que requieren revisión."
      );
    }

    const movimientos = [
      ...entradas.map(fila => ({
        _id: fila._id,
        tipo: "ENTRADA",
        fecha: fila.fecha,
        cantidad: fila.cantidad,
        observacion: fila.observacion || "",
        origen: "Entradas"
      })),

      ...salidas.map(fila => ({
        _id: fila._id,
        tipo: "SALIDA",
        fecha: fila.fecha,
        cantidad: fila.cantidad,
        observacion: fila.observacion || "",
        origen: "Salidas"
      })),

      ...vendidos.map(fila => ({
        _id: fila._id,
        tipo: "VENTA",
        fecha: fila.cabeceras[0].fecha,
        cantidad: fila.cantidad,
        factura: fila.factura,
        codigo: producto.codigo,
        producto: producto.descripcion,
        origen: "Vendidos"
      }))
    ];

    const orden = {
      ENTRADA: 0,
      SALIDA: 1,
      VENTA: 2
    };

    movimientos.sort((a, b) =>
      new Date(a.fecha) - new Date(b.fecha) ||
      orden[a.tipo] - orden[b.tipo] ||
      String(a._id).localeCompare(String(b._id))
    );

    return res.json({
      ok: true,
      stockInicial: previo.stockReal,
      movimientos
    });
  } catch (error) {
    console.error(
      "Error consultando movimientos:",
      error
    );

    return res.status(error.estado || 500).json({
      ok: false,

      mensaje: error.estado
        ? error.message
        : "No se pudieron consultar los movimientos."
    });
  }
}