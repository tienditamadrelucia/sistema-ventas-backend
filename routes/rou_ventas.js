import express from "express";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Cliente from "../models/Cliente.js";
import Producto from "../models/Producto.js";
import { crearVenta, obtenerVentas, buscarVentaPorNumero } from "../controllers/con_ventas.js";
import Tasas from "../models/dbTasas.js";
import Contador from "../models/Contador.js";
import Pago from "../models/Pago.js"; // 🔹 ajusta el nombre/ruta si es distinto

const router = express.Router();

router.post("/", crearVenta);
router.get("/", obtenerVentas);

// Número actual de factura (NO incrementa)
router.get("/factura-actual", async (req, res) => {
  try {
    const contador = await Contador.findOne({ tipo: "FACTURA" });
    return res.json({ ok: true, numero: contador.valor });
  } catch (error) {
    console.error("Error obteniendo número actual:", error);
    return res.status(500).json({ ok: false, msg: "Error obteniendo número actual" });
  }
});

// Guardar factura completa (venta + vendidos + pago)
router.post("/guardar", async (req, res) => {
  try {
    const { cliente, fecha, hora, subtotal, iva, total, usuario, estado, items, pago } = req.body;

    const numeroFactura = await asignarFactura(); // viene del controlador

    const venta = new Ventas({
      factura: numeroFactura,
      fecha,
      hora,
      cliente,
      subtotal,
      iva,
      total,
      usuario,
      estado
    });
    await venta.save();

    for (const item of items) {
      await new Vendidos({
        factura: numeroFactura,
        productoId: item.idProducto,
        cantidad: item.cantidad,
        precio: item.precioVenta,
        dscto: item.descuento || 0,
        total: item.total
      }).save();
    }

    if (pago) {
      await new Pago({
        factura: numeroFactura,
        idPago: pago.idPago,
        idVuelto: pago.idVuelto,
        totalAbonado: pago.totalAbonado,
        modoCredito: pago.modoCredito,
        abono: pago.abono,
        saldo: pago.saldo
      }).save();
    }

    return res.json({ ok: true, numeroFactura });
  } catch (error) {
    console.error("Error guardando factura:", error);
    return res.status(500).json({ ok: false, msg: "Error guardando factura" });
  }
});

// Buscar venta por número (para detalle rápido)
router.get("/vendidos/:numeroFactura", buscarVentaPorNumero);

// Resumen de ventas por fecha (Moneda)
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
    const ventas = await Moneda.find({ fecha });

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

// Detalle completo de una factura
router.get("/detalle/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);

    const venta = await Ventas.findOne({ factura });
    if (!venta) {
      return res.json({ ok: false, msg: "Factura no encontrada" });
    }

    const detalle = await Vendidos.find({ factura });
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

// REPORTE GENERAL
router.get("/reporte/:desde/:hasta", async (req, res) => {
  try {
    const { desde, hasta } = req.params;

    const fechaInicio = new Date(desde + "T00:00:00");
    const fechaFin = new Date(hasta + "T23:59:59");

    const ventas = await Ventas.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ factura: 1 });

    const reporte = [];

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
      const cliente = await Cliente.findOne({ identificacion: venta.cliente });

      const vendidos = await Vendidos.find({ factura: venta.factura });

      const productos = [];

      for (const v of vendidos) {
        const prod = await Producto.findById(v.productoId);

        productos.push({
          codigo: prod ? prod.codigo : "N/A",
          descripcion: prod ? prod.descripcion : "Producto no encontrado",
          precioSistema: prod ? prod.venta : 0,
          cantidad: v.cantidad,
          precioVenta: v.precio,
          dscto: v.dscto,
          total: v.total
        });
      }

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
        if (p.operacion === "VENTA" || p.operacion === "ABONO DE CREDITO") {
          pagos.efectivoP += Number(p.efectivoP || 0);
          pagos.transferenciaP += Number(p.transferenciaP || 0);

          pagos.efectivoBs += Number(p.efectivoBs || 0);
          pagos.transferenciaBs += Number(p.transferenciaBs || 0);
          pagos.puntoBs += Number(p.puntoBs || 0);
          pagos.pagomovilBs += Number(p.pagomovilBs || 0);

          pagos.efectivoD += Number(p.efectivoD || 0);
          pagos.zelle += Number(p.zelle || 0);
        }

        if (p.operacion === "VUELTOS") {
          pagos.vueltoP += Number(p.efectivoP || 0);
          pagos.vueltoBs += Number(p.efectivoBs || 0);
          pagos.vueltoD += Number(p.efectivoD || 0);
        }
      }

      totalVentas += Number(venta.total || 0);

      totalEfectivoP += pagos.efectivoP + pagos.vueltoP;
      totalTransferenciaP += pagos.transferenciaP;

      totalEfectivoBs += pagos.efectivoBs + pagos.vueltoBs;
      totalTransferenciaBs += pagos.transferenciaBs;
      totalPuntoBs += pagos.puntoBs;
      totalPagoMovilBs += pagos.pagomovilBs;

      totalEfectivoD += pagos.efectivoD + pagos.vueltoD;
      totalZelle += pagos.zelle;

      totalVueltoP += pagos.vueltoP;
      totalVueltoBs += pagos.vueltoBs;
      totalVueltoD += pagos.vueltoD;

      reporte.push({
        venta,
        clienteNombre: cliente ? cliente.nombreCompleto : "SIN NOMBRE",
        productos,
        pagos
      });
    }

    res.json({
      ok: true,
      reporte,
      totales: {
        totalPesos: totalEfectivoP + totalTransferenciaP + totalVueltoP,
        totalBolivares:
          totalEfectivoBs +
          totalTransferenciaBs +
          totalPuntoBs +
          totalPagoMovilBs +
          totalVueltoBs,
        totalDolares: totalEfectivoD + totalZelle + totalVueltoD,
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

// REPORTE CRÉDITOS
router.get("/reporte-creditos/:desde/:hasta", async (req, res) => {
  try {
    const { desde, hasta } = req.params;

    const fechaInicio = new Date(desde + "T00:00:00");
    const fechaFin = new Date(hasta + "T23:59:59");

    const ventas = await Ventas.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin },
      estado: "CREDITO"
    }).sort({ factura: 1 });

    const reporte = [];

    const hoy = new Date().toISOString().slice(0, 10);
    const tasaHoy = await Tasas.findOne({ fecha: hoy });
    if (!tasaHoy) {
      return res.json({ ok: false, msg: "No hay tasa registrada hoy" });
    }
    const tasaP = Number(tasaHoy.tasaP);
    const tasaD = Number(tasaHoy.tasaD);

    for (const venta of ventas) {
      const cliente = await Cliente.findOne({ identificacion: venta.cliente });

      const vendidos = await Vendidos.find({ factura: venta.factura });

      const productos = [];

      for (const v of vendidos) {
        const prod = await Producto.findById(v.productoId);

        productos.push({
          codigo: prod ? prod.codigo : "N/A",
          descripcion: prod ? prod.descripcion : "Producto no encontrado",
          cantidad: v.cantidad,
          precioSistema: prod ? prod.venta : 0,
          precioVenta: v.precio,
          dscto: v.dscto,
          total: v.total
        });
      }

      const abonosDocs = await Moneda.find({
        factura: venta.factura,
        operacion: "ABONO DE CREDITO"
      }).sort({ fecha: 1 });

      const abonos = [];
      let totalAbonadoD = 0;

      for (const a of abonosDocs) {
        abonos.push({
          fecha: a.fecha,
          efectivoP: a.efectivoP,
          transferenciaP: a.transferenciaP,
          efectivoBs: a.efectivoBs,
          transferenciaBs: a.transferenciaBs,
          puntoBs: a.puntoBs,
          pagomovilBs: a.pagomovilBs,
          efectivoD: a.efectivoD,
          zelle: a.zelle
        });

        const abonoEnD =
          (a.efectivoP + a.transferenciaP) / tasaP +
          (a.efectivoBs + a.transferenciaBs + a.puntoBs + a.pagomovilBs) / tasaD +
          (a.efectivoD + a.zelle);

        totalAbonadoD += abonoEnD;
      }

      const saldoD = venta.total - totalAbonadoD;
      const saldoP = saldoD * tasaP;
      const saldoBs = saldoD * tasaD;

      reporte.push({
        venta,
        clienteNombre: cliente ? cliente.nombreCompleto : "SIN NOMBRE",
        productos,
        abonos,
        saldo: {
          pesos: saldoP,
          bolivares: saldoBs,
          dolares: saldoD
        }
      });
    }

    res.json({ ok: true, reporte });

  } catch (error) {
    console.log("ERROR REPORTE CREDITOS:", error);
    res.status(500).json({ ok: false, msg: "Error generando reporte de créditos" });
  }
});

export default router;
