import express from "express";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Cliente from "../models/Cliente.js";
import Producto from "../models/Producto.js";
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
    const ventas = await Ventas.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ factura: 1 });
    const reporte = [];
    for (const venta of ventas) {
      // ============================
      // 1. CLIENTE
      // ============================
      const cliente = await Cliente.findOne({ identificacion: venta.cliente });      
      // ============================
      // 2. PRODUCTOS
      // ============================
      const vendidos = await Vendidos.find({ factura: venta.factura });
      const productos = [];
      for (const v of vendidos) {
        const prod = await Producto.findById(v.productoId);
        productos.push({
          codigo: prod ? prod.codigo : "N/A",
          descripcion: prod ? prod.descripcion : "Producto no encontrado",
          precioSistema: prod ? prod.precioSistema : 0,
          cantidad: v.cantidad,
          precioVenta: v.precio,
          dscto: v.dscto,
          total: v.total
        });
      }
      // ============================
      // 3. PAGOS + VUELTOS
      // ============================
      const pagosDocs = await Moneda.find({ factura: venta.factura });
      let pagos = {
        // pagos
        efectivoP: 0,
        transferenciaP: 0,
        efectivoBs: 0,
        transferenciaBs: 0,
        puntoBs: 0,
        pagomovilBs: 0,
        efectivoD: 0,
        zelleD: 0,
        // vueltos (ya vienen en negativo)
        vueltoP: 0,
        vueltoBs: 0,
        vueltoD: 0
      };
      for (const p of pagosDocs) {
        if (p.operacion === "PAGO") {
          pagos.efectivoP += Number(p.efectivoP || 0);
          pagos.transferenciaP += Number(p.transferenciaP || 0);
          pagos.efectivoBs += Number(p.efectivoBs || 0);
          pagos.transferenciaBs += Number(p.transferenciaBs || 0);
          pagos.puntoBs += Number(p.puntoBs || 0);
          pagos.pagomovilBs += Number(p.pagomovilBs || 0);
          pagos.efectivoD += Number(p.efectivoD || 0);
          pagos.zelleD += Number(p.zelleD || 0);
        }
        if (p.operacion === "VUELTOS") {
          pagos.vueltoP += Number(p.efectivoP || 0);
          pagos.vueltoBs += Number(p.efectivoBs || 0);
          pagos.vueltoD += Number(p.efectivoD || 0);
        }
      }
      // ============================
      // 4. ARMAR REPORTE
      // ============================
      reporte.push({
        venta,
        clienteNombre: cliente ? cliente.nombreCompleto : "SIN NOMBRE",
        productos,
        pagos
      });
    }
    res.json({ ok: true, reporte });
  } catch (error) {
    console.log("ERROR REPORTE:", error);
    res.status(500).json({ ok: false, msg: "Error generando reporte" });
  }
});




export default router;
