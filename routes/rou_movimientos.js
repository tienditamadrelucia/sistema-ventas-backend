import express from "express";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
//import Venta from "../models/Venta.js";

const router = express.Router();

router.get("/:productoId", async (req, res) => {
  try {
    const { productoId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    fin.setHours(23, 59, 59, 999);

    // ============================
    // 1. ENTRADAS
    // ============================
    const entradas = await Entrada.find({
      productoId,
      fecha: { $gte: inicio, $lte: fin }
    });

    // ============================
    // 2. SALIDAS
    // ============================
    const salidas = await Salida.find({
      productoId,
      fecha: { $gte: inicio, $lte: fin }
    });

    // ============================
    // 3. VENDIDOS (DETALLE POR PRODUCTO)
    // ============================
    const vendidos = await Vendidos.find({
      productoId,
      createdAt: { $gte: inicio, $lte: fin }
    }).populate("productoId", "codigo descripcion");

    // ============================
    // 4. UNIFICAR MOVIMIENTOS
    // ============================
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
      })),

      ...vendidos.map(v => ({
        tipo: "VENTA",
        fecha: v.createdAt,
        cantidad: v.cantidad,
        total: v.total,
        factura: v.factura,
        producto: v.productoId?.descripcion || "",
        codigo: v.productoId?.codigo || "",
        origen: "Vendidos"
      }))
    ];

    // ============================
    // 5. ORDENAR POR FECHA
    // ============================
    movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    res.json({ ok: true, movimientos });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: "Error obteniendo movimientos" });
  }
});


export default router;