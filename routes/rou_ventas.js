import express from "express";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Cliente from "../models/Cliente.js";
import Producto from "../models/Producto.js";
import { crearVenta, obtenerVentas, buscarVentaPorNumero } from "../controllers/con_ventas.js";
import Tasas from "../models/dbTasas.js";
import Contador from "../models/Contador.js";
import Categoria from "../models/Categoria.js"
import Gastos from "../models/dbGastos.js";
import ActividadProductiva from "../models/dbListaProductiva.js";

const router = express.Router();

// =====================================================
// FECHA ACTUAL DE VENEZUELA
// =====================================================
function obtenerFechaVenezuela() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const valores = {};

  partes.forEach((parte) => {
    if (parte.type !== "literal") {
      valores[parte.type] = parte.value;
    }
  });

  return `${valores.year}-${valores.month}-${valores.day}`;
}

const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};
 
router.post("/", crearVenta);
router.get("/", obtenerVentas);

// Número actual de factura (NO incrementa)
// =====================================================
// NÚMERO ACTUAL DE FACTURA POR SEDE
// NO INCREMENTA
// =====================================================
router.get("/factura-actual", async (req, res) => {
  try {
    const sede =
      req.query.sede || "TIENDITA";

    if (
      sede !== "TIENDITA" &&
      sede !== "MONASTERIO"
    ) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida"
      });
    }

    const tipoContador =
      sede === "MONASTERIO"
        ? "FACTURA_MONASTERIO"
        : "FACTURA_TIENDITA";

    let contador = await Contador.findOne({
      tipo: tipoContador
    });

    // Si todavía no existe el contador,
    // lo creamos en 0.
    if (!contador) {
      contador = await Contador.create({
        tipo: tipoContador,
        valor: 0
      });
    }

    return res.json({
      ok: true,
      numero: contador.valor,
      sede
    });

  } catch (error) {
    console.error(
      "Error obteniendo número actual:",
      error
    );

    return res.status(500).json({
      ok: false,
      msg: "Error obteniendo número actual"
    });
  }
});

// Guardar factura completa (venta + vendidos + pago)
router.post("/guardar", async (req, res) => {
  try {
    const { cliente, fecha, hora, subtotal, iva, total, usuario, estado, items, pago, sede } = req.body;
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
      estado,
      sede: sede || "TIENDITA"
    });
    await venta.save();
    for (const item of items) {
      await new Vendidos({
        factura: numeroFactura,
        productoId: item.idProducto,
        cantidad: item.cantidad,
        precio: item.precioVenta,
        dscto: item.descuento || 0,
        total: item.total,
        sede: sede || "TIENDITA"
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
router.get("/moneda/fecha/:fecha", async (req, res) => {
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
    console.log(VentasP, VentasD, VentasBs);
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

// Detalle completo de una factura POR SEDE
router.get("/detalle/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const venta = await Ventas.findOne({
      factura,
      ...filtroSede
    });

    if (!venta) {
      return res.json({
        ok: false,
        msg: "Factura no encontrada"
      });
    }

    const detalle = await Vendidos.find({
      factura,
      ...filtroSede
    });

    const pagos = await Moneda.find({
      factura,
      ...filtroSede
    });

    return res.json({
      ok: true,
      venta,
      detalle,
      pagos
    });

  } catch (error) {
    console.error(
      "Error consultando factura:",
      error
    );

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
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida"
      });
    }

    const fechaInicio = new Date(desde + "T00:00:00");
    const fechaFin = new Date(hasta + "T23:59:59");

    const filtroSede = filtroPorSede(sede);

    // =====================================================
    // 1. MOVIMIENTOS DE DINERO DE ESTA SEDE
    // =====================================================
    const movimientos = await Moneda.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin },
      ...filtroSede
    }).sort({ factura: 1 });

    if (movimientos.length === 0) {
      return res.json({
        ok: false,
        msg: "No hay movimientos en este rango"
      });
    }

    // =====================================================
    // 2. AGRUPAR POR FACTURA
    // =====================================================
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

      facturasMap[mov.factura].pagos.push(mov);

      if (
        mov.operacion === "VENTA" ||
        mov.operacion === "ABONO DE CREDITO"
      ) {
        facturasMap[mov.factura].totales.efectivoP +=
          Number(mov.efectivoP || 0);

        facturasMap[mov.factura].totales.transferenciaP +=
          Number(mov.transferenciaP || 0);

        facturasMap[mov.factura].totales.efectivoBs +=
          Number(mov.efectivoBs || 0);

        facturasMap[mov.factura].totales.transferenciaBs +=
          Number(mov.transferenciaBs || 0);

        facturasMap[mov.factura].totales.puntoBs +=
          Number(mov.puntoBs || 0);

        facturasMap[mov.factura].totales.pagomovilBs +=
          Number(mov.pagomovilBs || 0);

        facturasMap[mov.factura].totales.efectivoD +=
          Number(mov.efectivoD || 0);

        facturasMap[mov.factura].totales.zelle +=
          Number(mov.zelle || 0);
      }

      // Los vueltos ya están guardados negativos
      if (mov.operacion === "VUELTOS") {
        facturasMap[mov.factura].totales.vueltoP +=
          Number(mov.efectivoP || 0);

        facturasMap[mov.factura].totales.vueltoBs +=
          Number(mov.efectivoBs || 0);

        facturasMap[mov.factura].totales.vueltoD +=
          Number(mov.efectivoD || 0);
      }
    }

    const reporte = [];

    const totalesGlobales = {
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

    // =====================================================
    // 3. COMPLETAR INFORMACIÓN DE CADA FACTURA
    // =====================================================
    for (const factura in facturasMap) {
      const info = facturasMap[factura];

      const venta = await Ventas.findOne({
        factura: Number(factura),
        ...filtroSede
      });

      // Si no existe la venta de esta sede, no incluirla
      if (!venta) continue;

      const cliente = await Cliente.findOne({
        identificacion: venta.cliente
      });

      const vendidos = await Vendidos.find({
        factura: Number(factura),
        ...filtroSede
      });

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

      const t = info.totales;

      totalesGlobales.totalEfectivoP +=
        t.efectivoP + t.vueltoP;

      totalesGlobales.totalTransferenciaP +=
        t.transferenciaP;

      totalesGlobales.totalEfectivoBs +=
        t.efectivoBs + t.vueltoBs;

      totalesGlobales.totalTransferenciaBs +=
        t.transferenciaBs;

      totalesGlobales.totalPuntoBs +=
        t.puntoBs;

      totalesGlobales.totalPagomovilBs +=
        t.pagomovilBs;

      totalesGlobales.totalEfectivoD +=
        t.efectivoD + t.vueltoD;

      totalesGlobales.totalZelle +=
        t.zelle;

      totalesGlobales.totalVueltoP +=
        t.vueltoP;

      totalesGlobales.totalVueltoBs +=
        t.vueltoBs;

      totalesGlobales.totalVueltoD +=
        t.vueltoD;

      reporte.push({
        factura,
        venta,
        clienteNombre:
          cliente?.nombreCompleto || "SIN NOMBRE",
        productos,
        pagos: info.totales
      });
    }

    return res.json({
      ok: true,
      sede,
      reporte,
      totales: totalesGlobales
    });

  } catch (error) {
    console.error("ERROR REPORTE:", error);

    return res.status(500).json({
      ok: false,
      msg: "Error generando reporte"
    });
  }
});

// REPORTE CRÉDITOS
router.get("/reporte-creditos/:desde/:hasta", async (req, res) => {
  try {

    const { desde, hasta } = req.params;
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    // =====================================================
    // RANGO DE FECHAS
    // =====================================================
    const fechaInicio = new Date(`${desde}T00:00:00`);
    const fechaFin = new Date(`${hasta}T23:59:59.999`);

    // =====================================================
    // VENTAS A CRÉDITO DE ESTA SEDE
    // =====================================================
    const ventas = await Ventas.find({
      ...filtroSede,
      fecha: {
        $gte: fechaInicio,
        $lte: fechaFin
      },
      estado: "CREDITO"
    }).sort({ factura: 1 });

    const reporte = [];

    // =====================================================
    // TASA DE HOY - FECHA VENEZUELA
    // Se usa solamente para expresar el saldo ACTUAL
    // en pesos y bolívares.
    // =====================================================
    const hoy = obtenerFechaVenezuela();

    const [añoHoy, mesHoy, diaHoy] = hoy
      .split("-")
      .map(Number);

    const inicioHoy = new Date(
      Date.UTC(añoHoy, mesHoy - 1, diaHoy, 0, 0, 0)
    );

    const finHoy = new Date(
      Date.UTC(añoHoy, mesHoy - 1, diaHoy + 1, 0, 0, 0)
    );

    const tasaHoy = await Tasas.findOne({
      sede,
      fecha: {
        $gte: inicioHoy,
        $lt: finHoy
      }
    });

    if (!tasaHoy) {
      return res.json({
        ok: false,
        msg: "No hay tasa registrada hoy"
      });
    }

    const tasaPActual = Number(tasaHoy.tasaP || 0);
    const tasaDActual = Number(tasaHoy.tasaD || 0);

    // =====================================================
    // RECORRER VENTAS
    // =====================================================
    for (const venta of ventas) {

      // CLIENTES SON COMPARTIDOS ENTRE LAS DOS SEDES
      const cliente = await Cliente.findOne({
        identificacion: venta.cliente
      });

      // ===================================================
      // PRODUCTOS VENDIDOS
      // ===================================================
      const vendidos = await Vendidos.find({
        factura: venta.factura,
        ...filtroSede
      });

      const productos = [];

      for (const v of vendidos) {

        const prod = await Producto.findById(v.productoId);

        productos.push({
          codigo: prod ? prod.codigo : "N/A",
          descripcion: prod
            ? prod.descripcion
            : "Producto no encontrado",
          cantidad: Number(v.cantidad || 0),
          precioSistema: prod
            ? Number(prod.venta || 0)
            : 0,
          precioVenta: Number(v.precio || 0),
          dscto: Number(v.dscto || 0),
          total: Number(v.total || 0)
        });
      }

      // ===================================================
      // MOVIMIENTOS DEL CRÉDITO
      //
      // Incluimos ABONOS y VUELTOS.
      // Cada movimiento se convierte usando la tasa
      // correspondiente a SU FECHA.
      // ===================================================
      const movimientos = await Moneda.find({
        factura: venta.factura,
        ...filtroSede,
        operacion: {
          $in: [
            "ABONO DE CREDITO",
            "VUELTOS"
          ]
        }
      }).sort({ fecha: 1 });

      const abonos = [];

      let totalAbonadoD = 0;

      // ===================================================
      // PROCESAR MOVIMIENTOS
      // ===================================================
      for (const movimiento of movimientos) {

        const añoMovimiento = movimiento.fecha.getUTCFullYear();
        const mesMovimiento = movimiento.fecha.getUTCMonth();
        const diaMovimiento = movimiento.fecha.getUTCDate();

        const inicioMovimiento = new Date(
          Date.UTC(
            añoMovimiento,
            mesMovimiento,
            diaMovimiento,
            0,
            0,
            0
          )
        );

        const finMovimiento = new Date(
          Date.UTC(
            añoMovimiento,
            mesMovimiento,
            diaMovimiento + 1,
            0,
            0,
            0
          )
        );

        // Buscar tasa correspondiente al día del movimiento
        const tasaMovimiento = await Tasas.findOne({
          sede,
          fecha: {
          $gte: inicioMovimiento,
          $lt: finMovimiento
          }
      });

        // Si por alguna razón no existe tasa histórica,
        // usamos la actual como respaldo para no romper
        // completamente el reporte.
        const tasaPMovimiento = Number(
          tasaMovimiento?.tasaP ||
          tasaPActual ||
          0
        );

        const tasaDMovimiento = Number(
          tasaMovimiento?.tasaD ||
          tasaDActual ||
          0
        );

        const efectivoP =
          Number(movimiento.efectivoP || 0);

        const transferenciaP =
          Number(movimiento.transferenciaP || 0);

        const efectivoBs =
          Number(movimiento.efectivoBs || 0);

        const transferenciaBs =
          Number(movimiento.transferenciaBs || 0);

        const puntoBs =
          Number(movimiento.puntoBs || 0);

        const pagomovilBs =
          Number(movimiento.pagomovilBs || 0);

        const efectivoD =
          Number(movimiento.efectivoD || 0);

        const zelle =
          Number(movimiento.zelle || 0);

        // =================================================
        // CONVERTIR EL MOVIMIENTO A DÓLARES
        // =================================================
        let movimientoEnD = 0;

        if (tasaPMovimiento > 0) {
          movimientoEnD +=
            (efectivoP + transferenciaP) /
            tasaPMovimiento;
        }

        if (tasaDMovimiento > 0) {
          movimientoEnD +=
            (
              efectivoBs +
              transferenciaBs +
              puntoBs +
              pagomovilBs
            ) / tasaDMovimiento;
        }

        movimientoEnD += efectivoD + zelle;

        // =================================================
        // LOS VUELTOS RESTAN
        // =================================================
        if (movimiento.operacion === "VUELTOS") {
          movimientoEnD *= -1;
        }

        totalAbonadoD += movimientoEnD;

        // Guardamos solamente los abonos para mostrarlos
        // en la sección correspondiente del reporte.
        if (
          movimiento.operacion ===
          "ABONO DE CREDITO"
        ) {

          abonos.push({
            fecha: movimiento.fecha,

            efectivoP,
            transferenciaP,

            efectivoBs,
            transferenciaBs,
            puntoBs,
            pagomovilBs,

            efectivoD,
            zelle,

            tasaP: tasaPMovimiento,
            tasaD: tasaDMovimiento,

            equivalenteDolares: movimientoEnD
          });
        }
      }

      // ===================================================
      // SALDO EN DÓLARES
      // ===================================================
      let saldoD =
        Number(venta.total || 0) -
        totalAbonadoD;

      // Misma tolerancia que Pago/Consulta
      const TOLERANCIA_USD = 0.25;

      if (
        saldoD >= 0 &&
        saldoD <= TOLERANCIA_USD
      ) {
        saldoD = 0;
      }

      // ===================================================
      // CONVERTIR SALDO ACTUAL
      // ===================================================
      const saldoP =
        saldoD * tasaPActual;

      const saldoBs =
        saldoD * tasaDActual;

      // ===================================================
      // AGREGAR AL REPORTE
      // ===================================================
      reporte.push({

        venta,

        clienteNombre:
          cliente
            ? cliente.nombreCompleto
            : "SIN NOMBRE",

        productos,

        abonos,

        totalAbonadoD,

        saldo: {
          pesos: saldoP,
          bolivares: saldoBs,
          dolares: saldoD
        }
      });
    }

    // =====================================================
    // RESPUESTA
    // =====================================================
    return res.json({
      ok: true,
      sede,
      reporte
    });

  } catch (error) {

    console.log(
      "ERROR REPORTE CREDITOS:",
      error
    );

    return res.status(500).json({
      ok: false,
      msg: "Error generando reporte de créditos"
    });
  }
});

router.get("/resumen", async (req, res) => {
  try {
    const { desde, hasta, sede } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, mensaje: "Debe enviar ambas fechas" });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({ ok: false, mensaje: "Sede inválida" });
    }

    const inicio = new Date(desde);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    const ventas = await Moneda.aggregate([
      {
        $match: {
          fecha: { $gte: inicio, $lte: fin },
          operacion: "VENTA",
          sede
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

    const resumen = ventas.map(v => ({
      fecha: v._id.dia,
      dolares: v.totalDolares,
      bolivares: v.totalBolivares,
      pesos: v.totalPesos
    }));

    const totales = {
      dolares: resumen.reduce((acc, r) => acc + r.dolares, 0),
      bolivares: resumen.reduce((acc, r) => acc + r.bolivares, 0),
      pesos: resumen.reduce((acc, r) => acc + r.pesos, 0)
    };

    res.json({ ok: true, resumen, totales });
  } catch (error) {
    console.error("Error generando resumen de ventas:", error);
    res.status(500).json({ ok: false, mensaje: "Error generando resumen de ventas" });
  }
});

// =====================================================
// UTILIDAD POR ACTIVIDAD PRODUCTIVA
// Ventas reales - Costos reales de producción
// Ambas sedes
// =====================================================
router.get("/utilidad-actividad", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, mensaje: "Debe indicar fecha desde y hasta." });
    }

    const inicio = new Date(`${desde}T00:00:00.000Z`);
    const fin = new Date(`${hasta}T23:59:59.999Z`);

    // 1. Catálogo de actividades
    const actividades = await ActividadProductiva.find().sort({ descripcion: 1 });

    // 2. Ventas realizadas en el período
    // Usamos la fecha de la factura, no createdAt de Vendidos.
    const ventasPeriodo = await Ventas.find({
      fecha: { $gte: inicio, $lte: fin }
    }).select("factura sede fecha estado");

    const clavesVenta = new Set(
      ventasPeriodo.map(v => `${v.sede || "TIENDITA"}-${v.factura}`)
    );

    // 3. Líneas vendidas que tienen actividad productiva
    const vendidos = await Vendidos.find({
      actividadProductiva: { $ne: null }
    }).populate("actividadProductiva", "descripcion");

    // 4. Costos de producción del período
    const gastos = await Gastos.find({
      fecha: { $gte: inicio, $lte: fin },
      clasificacion: "COSTO_PRODUCCION",
      actividadProductiva: { $ne: null }
    }).populate("actividadProductiva", "descripcion");

    // 5. Preparar todas las actividades
    const mapa = {};

    for (const actividad of actividades) {
      mapa[String(actividad._id)] = {
        actividadId: actividad._id,
        actividad: actividad.descripcion,
        ventasTiendita: 0,
        ventasMonasterio: 0,
        ventasTotales: 0,
        costosTiendita: 0,
        costosMonasterio: 0,
        costosTotales: 0,
        utilidad: 0,
        margen: 0
      };
    }

    // 6. Acumular ventas reales
    for (const vendido of vendidos) {
      const sede = vendido.sede || "TIENDITA";
      const claveVenta = `${sede}-${vendido.factura}`;

      // Solo líneas pertenecientes a facturas del período
      if (!clavesVenta.has(claveVenta)) continue;

      const actividadId = vendido.actividadProductiva?._id
        ? String(vendido.actividadProductiva._id)
        : String(vendido.actividadProductiva || "");

      if (!actividadId) continue;

      // Por seguridad, si existe una actividad histórica que ya no está
      // en el catálogo, también la mostramos.
      if (!mapa[actividadId]) {
        mapa[actividadId] = {
          actividadId,
          actividad: vendido.actividadProductiva?.descripcion || "ACTIVIDAD NO ENCONTRADA",
          ventasTiendita: 0,
          ventasMonasterio: 0,
          ventasTotales: 0,
          costosTiendita: 0,
          costosMonasterio: 0,
          costosTotales: 0,
          utilidad: 0,
          margen: 0
        };
      }

      const total = Number(vendido.total || 0);

      if (sede === "MONASTERIO") mapa[actividadId].ventasMonasterio += total;
      else mapa[actividadId].ventasTiendita += total;
    }

    // 7. Acumular costos reales
    for (const gasto of gastos) {
      const actividadId = gasto.actividadProductiva?._id
        ? String(gasto.actividadProductiva._id)
        : String(gasto.actividadProductiva || "");

      if (!actividadId) continue;

      if (!mapa[actividadId]) {
        mapa[actividadId] = {
          actividadId,
          actividad: gasto.actividadProductiva?.descripcion || "ACTIVIDAD NO ENCONTRADA",
          ventasTiendita: 0,
          ventasMonasterio: 0,
          ventasTotales: 0,
          costosTiendita: 0,
          costosMonasterio: 0,
          costosTotales: 0,
          utilidad: 0,
          margen: 0
        };
      }

      const monto = Number(gasto.monto || 0);

      if (gasto.sede === "MONASTERIO") mapa[actividadId].costosMonasterio += monto;
      else mapa[actividadId].costosTiendita += monto;
    }

    // 8. Calcular totales y utilidad
    const reporte = Object.values(mapa)
      .map(item => {
        item.ventasTotales = item.ventasTiendita + item.ventasMonasterio;
        item.costosTotales = item.costosTiendita + item.costosMonasterio;
        item.utilidad = item.ventasTotales - item.costosTotales;
        item.margen = item.ventasTotales > 0
          ? (item.utilidad / item.ventasTotales) * 100
          : 0;

        return item;
      })
      // No mostramos actividades completamente vacías en el período
      .filter(item => item.ventasTotales !== 0 || item.costosTotales !== 0)
      .sort((a, b) => a.actividad.localeCompare(b.actividad, "es"));

    // 9. Totales generales
    const totales = reporte.reduce((acc, item) => {
      acc.ventasTiendita += item.ventasTiendita;
      acc.ventasMonasterio += item.ventasMonasterio;
      acc.ventasTotales += item.ventasTotales;
      acc.costosTiendita += item.costosTiendita;
      acc.costosMonasterio += item.costosMonasterio;
      acc.costosTotales += item.costosTotales;
      acc.utilidad += item.utilidad;
      return acc;
    }, {
      ventasTiendita: 0,
      ventasMonasterio: 0,
      ventasTotales: 0,
      costosTiendita: 0,
      costosMonasterio: 0,
      costosTotales: 0,
      utilidad: 0
    });

    totales.margen = totales.ventasTotales > 0
      ? (totales.utilidad / totales.ventasTotales) * 100
      : 0;

    return res.json({ ok: true, desde, hasta, reporte, totales });

  } catch (error) {
    console.error("ERROR UTILIDAD POR ACTIVIDAD:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error generando utilidad por actividad productiva.",
      detalle: error.message
    });
  }
});

router.get("/reporte-categoria", async (req, res) => {
  try {
    const { desde, hasta, sede } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe enviar ambas fechas"
      });
    }

    if (!sede) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe indicar la sede"
      });
    }

    const inicio = new Date(desde);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    // ============================================
    // 1. BUSCAR FACTURAS CONTADO DE LA SEDE
    // ============================================
    const ventasContado = await Ventas.find({
      estado: "CONTADO",
      sede: sede,
      fecha: { $gte: inicio, $lte: fin }
    });

    const facturas = ventasContado.map(v => v.factura);

    if (facturas.length === 0) {
      return res.json({
        ok: true,
        reporte: {}
      });
    }

    // ============================================
    // 2. BUSCAR PRODUCTOS VENDIDOS
    // ============================================
    const vendidos = await Vendidos.find({
      factura: { $in: facturas },
      sede: sede
    }).populate("productoId");

    // ============================================
    // 3. BUSCAR MOVIMIENTOS DE MONEDA
    // ============================================
    const movimientos = await Moneda.find({
      factura: { $in: facturas },
      sede: sede
    });
    // ============================================
    // 4. AGRUPAR PAGOS POR FACTURA
    // ============================================
    const pagosPorFactura = {};

    for (const mov of movimientos) {
      const f = mov.factura;

      if (!pagosPorFactura[f]) {
        pagosPorFactura[f] = {
          P: 0,
          Bs: 0,
          D: 0
        };
      }

      pagosPorFactura[f].P +=
        (mov.efectivoP || 0) +
        (mov.transferenciaP || 0);

      pagosPorFactura[f].Bs +=
        (mov.efectivoBs || 0) +
        (mov.transferenciaBs || 0) +
        (mov.puntoBs || 0) +
        (mov.pagomovilBs || 0);

      pagosPorFactura[f].D +=
        (mov.efectivoD || 0) +
        (mov.zelle || 0);
    }

    // ============================================
    // 5. BUSCAR CATEGORÍAS
    // ============================================
    const categorias = await Categoria.find()
      .sort({ descripcion: 1 });

    const reporte = {};

    // ============================================
    // 6. PROCESAR CADA CATEGORÍA
    // ============================================
    for (const cat of categorias) {
      const nombreCategoria = cat.descripcion;
      const codigoCategoria = cat.codigo;

      reporte[nombreCategoria] = {};

      for (const v of vendidos) {
        const producto = v.productoId;

        if (!producto) continue;

        if (producto.categoria !== codigoCategoria) {
          continue;
        }

        const descripcion = producto.descripcion;

        if (!reporte[nombreCategoria][descripcion]) {
          reporte[nombreCategoria][descripcion] = {
            cantidadVendida: 0,
            totalP: 0,
            totalBs: 0,
            totalD: 0,
            costo: producto.costo || 0,
            precioVenta: producto.venta || 0,
            utilidad: 0
          };
        }

        // Cantidad vendida
        reporte[nombreCategoria][descripcion].cantidadVendida +=
          v.cantidad;

        // Utilidad
        const utilidadItem =
          ((producto.venta || 0) - (producto.costo || 0)) *
          v.cantidad;

        reporte[nombreCategoria][descripcion].utilidad +=
          utilidadItem;

        // Pagos correspondientes a la factura
        const factura = v.factura;

        if (pagosPorFactura[factura]) {
          reporte[nombreCategoria][descripcion].totalP +=
            pagosPorFactura[factura].P;

          reporte[nombreCategoria][descripcion].totalBs +=
            pagosPorFactura[factura].Bs;

          reporte[nombreCategoria][descripcion].totalD +=
            pagosPorFactura[factura].D;
        }
      }

      // ============================================
      // 7. ORDENAR PRODUCTOS ALFABÉTICAMENTE
      // ============================================
      const productosOrdenados = Object.keys(
        reporte[nombreCategoria]
      ).sort((a, b) => a.localeCompare(b, "es"));

      const ordenados = {};

      for (const p of productosOrdenados) {
        ordenados[p] = reporte[nombreCategoria][p];
      }

      reporte[nombreCategoria] = ordenados;
    }

    res.json({
      ok: true,
      sede,
      reporte
    });

  } catch (error) {
    console.error("ERROR REPORTE CATEGORÍA:", error);

    res.status(500).json({
      ok: false,
      mensaje: "Error generando reporte"
    });
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
// Buscar venta/productos por número de factura POR SEDE
router.get("/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        msg: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const venta = await Ventas.findOne({
      factura,
      ...filtroSede
    });

    if (!venta) {
      return res.json({
        ok: false,
        venta: null,
        vendidos: []
      });
    }

    const vendidos = await Vendidos.find({
      factura,
      ...filtroSede
    }).populate("productoId");

    return res.json({
      ok: true,
      venta,
      vendidos
    });

  } catch (error) {
    console.error(
      "Error cargando venta:",
      error
    );

    return res.status(500).json({
      ok: false,
      msg: "Error cargando venta"
    });
  }
});

export default router;
