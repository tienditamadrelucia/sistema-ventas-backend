import express from "express";
import { conectarDB } from "../db/conexion.js";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Cliente from "../models/Cliente.js";
import Producto from "../models/Producto.js";
import { crearVenta, obtenerVentas, buscarVentaPorNumero } from "../controllers/con_ventas.js";
import Tasas from "../models/dbTasas.js";
import Contador from "../models/Contador.js";

const router = express.Router();

router.post("/", crearVenta);
router.get("/", obtenerVentas);

// Número actual de factura (NO incrementa)
router.get("/factura-actual", async (req, res) => {
  console.log("factura-actual");
  try {
    const db = conectarDB();
    const contador = await Contador.findOne({ tipo: "FACTURA" });
    console.log("contador ", contador);
    if (!contador) {
      return res.status(404).json({ ok: false, msg: "No existe contador FACTURA" });
    }
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
// REPORTE DIARIO BASADO EN MOVIMIENTOS DE CAJA (dbMoneda)
router.get("/reporte/:desde/:hasta", async (req, res) => {
  try {
    const { desde, hasta } = req.params;
    const fechaInicio = new Date(desde + "T00:00:00");
    const fechaFin = new Date(hasta + "T23:59:59");
    // 1. BUSCAR TODOS LOS MOVIMIENTOS DE DINERO DEL DÍA
    const movimientos = await Moneda.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ factura: 1 });
    if (movimientos.length === 0) {
      return res.json({ ok: false, msg: "No hay movimientos en este rango" });
    }
    // Agrupar por factura
    const facturasMap = {};
    for (const mov of movimientos) {
      if (!facturasMap[mov.factura]) {
        facturasMap[mov.factura] = {
          factura: mov.factura,
          pagos: [],
          totales: {
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
          }
        };
      }
      // Guardar movimiento
      facturasMap[mov.factura].pagos.push(mov);
      // Acumular totales
      if (mov.operacion === "VENTA" || mov.operacion === "ABONO DE CREDITO") {
        facturasMap[mov.factura].totales.efectivoP += mov.efectivoP;
        facturasMap[mov.factura].totales.transferenciaP += mov.transferenciaP;
        facturasMap[mov.factura].totales.efectivoBs += mov.efectivoBs;
        facturasMap[mov.factura].totales.transferenciaBs += mov.transferenciaBs;
        facturasMap[mov.factura].totales.puntoBs += mov.puntoBs;
        facturasMap[mov.factura].totales.pagomovilBs += mov.pagomovilBs;
        facturasMap[mov.factura].totales.efectivoD += mov.efectivoD;
        facturasMap[mov.factura].totales.zelle += mov.zelle;
      }
      if (mov.operacion === "VUELTOS") {
        facturasMap[mov.factura].totales.vueltoP += mov.efectivoP;
        facturasMap[mov.factura].totales.vueltoBs += mov.efectivoBs;
        facturasMap[mov.factura].totales.vueltoD += mov.efectivoD;
      }
    }
    const reporte = [];
    let totalesGlobales = {
      totalEfectivoP: 0,
      totalTransferenciaP: 0,
      totalEfectivoBs: 0,
      totalTransferenciaBs: 0,
      totalPuntoBs: 0,
      totalPagomovilBs: 0,
      totalEfectivoD: 0,
      totalZelle: 0,
      totalVueltoP: 0,
      totalVueltoBs: 0,
      totalVueltoD: 0
    };
    // 2. COMPLETAR INFORMACIÓN DE CADA FACTURA
    for (const factura in facturasMap) {
      const info = facturasMap[factura];
      const venta = await Ventas.findOne({ factura });
      const cliente = venta
        ? await Cliente.findOne({ identificacion: venta.cliente })
        : null;
      const vendidos = venta
        ? await Vendidos.find({ factura })
        : [];
      const productos = [];
      for (const v of vendidos) {
        const prod = await Producto.findById(v.productoId);
        productos.push({
          codigo: prod?.codigo || "N/A",
          descripcion: prod?.descripcion || "Producto no encontrado",
          precioSistema: prod?.venta || 0,
          cantidad: v.cantidad,
          precioVenta: v.precio,
          dscto: v.dscto,
          total: v.total
        });
      }
      // Acumular totales globales
      const t = info.totales;
      totalesGlobales.totalEfectivoP += t.efectivoP + t.vueltoP;
      totalesGlobales.totalTransferenciaP += t.transferenciaP;
      totalesGlobales.totalEfectivoBs += t.efectivoBs + t.vueltoBs;
      totalesGlobales.totalTransferenciaBs += t.transferenciaBs;
      totalesGlobales.totalPuntoBs += t.puntoBs;
      totalesGlobales.totalPagomovilBs += t.pagomovilBs;
      totalesGlobales.totalEfectivoD += t.efectivoD + t.vueltoD;
      totalesGlobales.totalZelle += t.zelle;
      totalesGlobales.totalVueltoP += t.vueltoP;
      totalesGlobales.totalVueltoBs += t.vueltoBs;
      totalesGlobales.totalVueltoD += t.vueltoD;
      reporte.push({
        factura,
        venta,
        clienteNombre: cliente?.nombreCompleto || "SIN NOMBRE",
        productos,
        pagos: info.totales
      });
    }
    res.json({
      ok: true,
      reporte,
      totales: totalesGlobales
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

router.get("/resumen", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, mensaje: "Debe enviar ambas fechas" });
    }
    const inicio = new Date(desde);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);
    const ventas = await Moneda.aggregate([
      {
        $match: {
          fecha: { $gte: inicio, $lte: fin },
          operacion: "VENTA"
        }
      },
      {
        $group: {
          _id: {
            dia: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } }
          },
          totalDolares: { $sum: "$efectivoD" },
          totalBolivares: {
            $sum: {
              $add: ["$efectivoBs", "$transferenciaBs", "$pagomovilBs", "$puntoBs"]
            }
          },
          totalPesos: {
            $sum: {
              $add: ["$efectivoP", "$transferenciaP"]
            }
          }
        }
      },
      { $sort: { "_id.dia": 1 } }
    ]);
    const resultado = ventas.map(v => ({
      fecha: v._id.dia,
      dolares: v.totalDolares,
      bolivares: v.totalBolivares,
      pesos: v.totalPesos
    }));
    res.json(resultado);
  } catch (error) {
    console.error("Error generando resumen de ventas:", error);
    res.status(500).json({ ok: false, mensaje: "Error generando resumen de ventas" });
  }
});


router.put("/cambiar-estado/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const venta = await Ventas.findByIdAndUpdate(
      id,
      { estado },
      { new: true }
    );
    res.json({ ok: true, venta });
  } catch (error) {
    res.status(500).json({ ok: false, msg: "Error actualizando estado" });
  }
});

// Buscar venta por número de factura
router.get("/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);
    const vendidos = await Vendidos.find({ factura }).populate("productoId");
    return res.json({ ok: true, vendidos });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: "Error cargando vendidos" });
  }
});

export default router;
