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

    // ============================
    //  TOTALES GENERALES
    // ============================
    let totalVentas = 0;

    let totalEfectivoP = 0;
    let totalTransferenciaP = 0;

    let totalEfectivoBs = 0;
    let totalTransferenciaBs = 0;
    let totalPuntoBs = 0;
    let totalPagoMovilBs = 0;

    let totalEfectivoD = 0;
    let totalZelle = 0;

    let totalVueltoP = 0;
    let totalVueltoBs = 0;
    let totalVueltoD = 0;

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
          precioSistema: prod ? prod.venta : 0,   // ✔ PRECIO DEL SISTEMA
          cantidad: v.cantidad,
          precioVenta: v.precio,                  // ✔ PRECIO REAL DE VENTA
          dscto: v.dscto,
          total: v.total
        });
      }

      // ============================
      // 3. PAGOS + VUELTOS
      // ============================
      const pagosDocs = await Moneda.find({ factura: venta.factura });

      let pagos = {
        efectivoP: 0,
        transferenciaP: 0,

        efectivoBs: 0,
        transferenciaBs: 0,
        puntoBs: 0,
        pagomovilBs: 0,

        efectivoD: 0,
        zelle: 0,

        vueltoP: 0,
        vueltoBs: 0,
        vueltoD: 0
      };

      for (const p of pagosDocs) {

        // ============================
        // PAGOS (operacion = "VENTA")
        // ============================
        if (p.operacion === "VENTA") {
          pagos.efectivoP += Number(p.efectivoP || 0);
          pagos.transferenciaP += Number(p.transferenciaP || 0);

          pagos.efectivoBs += Number(p.efectivoBs || 0);
          pagos.transferenciaBs += Number(p.transferenciaBs || 0);
          pagos.puntoBs += Number(p.puntoBs || 0);
          pagos.pagomovilBs += Number(p.pagomovilBs || 0);

          pagos.efectivoD += Number(p.efectivoD || 0);
          pagos.zelle += Number(p.zelle || 0);
        }

        // ============================
        // VUELTOS (operacion = "VUELTOS")
        // ============================
        if (p.operacion === "VUELTOS") {
          pagos.vueltoP += Number(p.efectivoP || 0);
          pagos.vueltoBs += Number(p.efectivoBs || 0);
          pagos.vueltoD += Number(p.efectivoD || 0);
        }
      }

      // ============================
      // 4. SUMAR A TOTALES GENERALES
      // ============================
      totalVentas += Number(venta.total || 0);

      totalEfectivoP += pagos.efectivoP;
      totalTransferenciaP += pagos.transferenciaP;

      totalEfectivoBs += pagos.efectivoBs;
      totalTransferenciaBs += pagos.transferenciaBs;
      totalPuntoBs += pagos.puntoBs;
      totalPagoMovilBs += pagos.pagomovilBs;

      totalEfectivoD += pagos.efectivoD;
      totalZelle += pagos.zelle;

      totalVueltoP += pagos.vueltoP;
      totalVueltoBs += pagos.vueltoBs;
      totalVueltoD += pagos.vueltoD;

      // ============================
      // 5. ARMAR REPORTE POR FACTURA
      // ============================
      reporte.push({
        venta,
        clienteNombre: cliente ? cliente.nombreCompleto : "SIN NOMBRE",
        productos,
        pagos
      });
    }

    // ============================
    // 6. RESPUESTA FINAL
    // ============================
    res.json({
  ok: true,
  reporte,
  totales: {
    // PESOS
    totalPesos: totalEfectivoP + totalTransferenciaP + totalVueltoP,

    // BOLÍVARES
    totalBolivares:
      totalEfectivoBs +
      totalTransferenciaBs +
      totalPuntoBs +
      totalPagoMovilBs +
      totalVueltoBs,

    // DÓLARES
    totalDolares: totalEfectivoD + totalZelle + totalVueltoD,

    // TOTALES INDIVIDUALES
    totalEfectivoP,
    totalTransferenciaP,

    totalEfectivoBs,
    totalTransferenciaBs,
    totalPuntoBs,
    totalPagoMovilBs,

    totalEfectivoD,
    totalZelle,

    totalVueltoP,
    totalVueltoBs,
    totalVueltoD
  }
});

  } catch (error) {
    console.log("ERROR REPORTE:", error);
    res.status(500).json({ ok: false, msg: "Error generando reporte" });
  }
});







export default router;
