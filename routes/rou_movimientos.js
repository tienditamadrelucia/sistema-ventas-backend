import express from "express";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
//import Venta from "../models/Venta.js";

const router = express.Router();

router.get("/:productoId", obtenerMovimientos);

async function obtenerMovimientos(req, res) {
  try {
    const { productoId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    fin.setHours(23, 59, 59, 999);

    const entradas = await Entrada.find({
      productoId,
      fecha: { $gte: inicio, $lte: fin }
    });

    const salidas = await Salida.find({
      productoId,
      fecha: { $gte: inicio, $lte: fin }
    });

    // VENTAS DESACTIVADO TEMPORALMENTE
    const ventas = [];

    const movimientos = [
      ...entradas.map(e => ({
        tipo: "ENTRADA",
        fecha: e.fecha,
        cantidad: e.cantidad,
        observacion: e.observacion || "",
        origen: "Entradas"
      })),
      ...salidas.map(s => ({
        tipo: "SALIDA",
        fecha: s.fecha,
        cantidad: s.cantidad,
        observacion: s.observacion || "",
        origen: "Salidas"
      }))
      // ...ventas (cuando exista)
    ];

    movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    res.json({ ok: true, movimientos });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: "Error obteniendo movimientos routes" });
  }
}
export default router;