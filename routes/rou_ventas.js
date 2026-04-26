import express from "express";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import { crearVenta, obtenerVentas, buscarVentaPorNumero } from "../controllers/con_ventas.js";

const router = express.Router();

router.post("/", crearVenta);
router.get("/", obtenerVentas);

// ⭐ NUEVA RUTA PARA BUSCAR FACTURA POR NÚMERO

router.get("/vendidos/:numeroFactura", buscarVentaPorNumero);

router.get("/ventas/:fecha", async (req, res) => {
    try {
        const { fecha } = req.params;
        if (!fecha || fecha.length !== 10) {
            return res.json({
                ok: false,
                msg: "Fecha inválida",
                VentasP: 0,
                VentasD: 0,
                VentasBs: 0
            });
        } 
        // Buscar todas las ventas del día
        const ventas = await dbMoneda.find({ fecha });
        // Sumar por moneda
        const VentasP = ventas.reduce((acc, v) => acc + (v.efectivoP || 0), 0);
        const VentasD = ventas.reduce((acc, v) => acc + (v.efectivoD || 0), 0);
        const VentasBs = ventas.reduce((acc, v) => acc + (v.efectivoBs || 0), 0);
        return res.json({
            ok: true,
            VentasP,
            VentasD,
            VentasBs
        });
    } catch (error) {
        console.error("ERROR EN VENTAS:", error);
        return res.status(500).json({
            ok: false,
            msg: "Error interno consultando ventas",
            VentasP: 0,
            VentasD: 0,
            VentasBs: 0
        });
    }
});

router.get("/detalle/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);
    // Buscar venta
    const venta = await Ventas.findOne({ factura });
    if (!venta) {
      return res.json({ ok: false, msg: "Factura no encontrada" });
    }
    // Buscar detalle
    const detalle = await Vendidos.find({ factura });
    // Buscar pagos
    const pagos = await Moneda.find({ factura });
    return res.json({
      ok: true,
      venta,
      detalle,
      pagos
    });
  } catch (error) {
    console.error("Error consultando factura:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error consultando factura"
    });
  }
});

/*
  REPORTE DIARIO / RANGO DE FECHAS
  /api/ventas/reporte/2024-01-01/2024-01-31
*/
router.get("/reporte/:desde/:hasta", async (req, res) => {
  try {
    const { desde, hasta } = req.params;
    const fechaInicio = new Date(desde + "T00:00:00");
    const fechaFin = new Date(hasta + "T23:59:59");
    // 1. Buscar ventas en el rango
    const ventas = await Ventas.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ factura: 1 });
    if (ventas.length === 0) {
      return res.json({ ok: false, msg: "No hay ventas en este rango" });
    }
    const reporte = [];
    // Totales finales por método de pago
    let totalEfectivoP = 0;
    let totalTransferenciaP = 0;
    let totalEfectivoBs = 0;
    let totalTransferenciaBs = 0;
    let totalPuntoBs = 0;
    let totalPagomovilBs = 0;
    let totalEfectivoD = 0;
    let totalZelle = 0;
    for (const venta of ventas) {
      const factura = venta.factura;
      // 2. Productos vendidos
      const productos = await Vendidos.find({ factura });
      // 3. Pagos
      const pagos = await Moneda.find({ factura });
      // Acumular totales finales
      for (const p of pagos) {
        totalEfectivoP += Number(p.efectivoP || 0);
        totalTransferenciaP += Number(p.transferenciaP || 0);
        totalEfectivoBs += Number(p.efectivoBs || 0);
        totalTransferenciaBs += Number(p.transferenciaBs || 0);
        totalPuntoBs += Number(p.puntoBs || 0);
        totalPagomovilBs += Number(p.pagomovilBs || 0);
        totalEfectivoD += Number(p.efectivoD || 0);
        totalZelle += Number(p.zelleD || 0);
      }
      reporte.push({
        venta,
        productos,
        pagos
      });
    }
    return res.json({
      ok: true,
      reporte,
      totales: {
        totalEfectivoP,
        totalTransferenciaP,
        totalEfectivoBs,
        totalTransferenciaBs,
        totalPuntoBs,
        totalPagomovilBs,
        totalEfectivoD,
        totalZelle
      }
    });
  } catch (error) {
    console.error("Error generando reporte:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error generando reporte"
    });
  }
});

export default router;
