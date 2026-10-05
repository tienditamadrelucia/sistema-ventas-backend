import express from "express";
import Vendidos from "../models/dbVendidos.js";
import PagoParticipacion from "../models/dbPagoParticipacion.js";
import dbGastos from "../models/dbGastos.js";
import ventas from "../models/dbVentas.js";
import {FacturaNro, asignarFactura} from "../controllers/con_ventas.js";

const router = express.Router();

const SEDES_VALIDAS = ["TIENDITA", "MONASTERIO"];


// ======================================================
// NORMALIZAR FECHA YYYY-MM-DD
// Evita el problema de retroceder un día en Venezuela
// ======================================================
function fechaUTC(fecha) {
  if (
    typeof fecha !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
  ) {
    return null;
  }

  const [year, month, day] =
    fecha.split("-").map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0
    )
  );
}

// ======================================================
// VENTAS PENDIENTES DE LIQUIDAR
// ======================================================
router.get("/ventas-pendientes", async (req, res) => {
  try {
    const { sedePaga, sedeRecibe } = req.query;

    if (!SEDES_VALIDAS.includes(sedePaga) || !SEDES_VALIDAS.includes(sedeRecibe) || sedePaga === sedeRecibe) {
      return res.status(400).json({ ok: false, mensaje: "Las sedes indicadas no son válidas." });
    }

    const pagos = await PagoParticipacion.find({ sedePaga, sedeRecibe }).select("detalleVentas.vendido").lean();
    const vendidosLiquidados = pagos.flatMap(p => (p.detalleVentas || []).map(d => d.vendido).filter(Boolean));

    const pendientes = await Vendidos.find({
      sede: sedePaga,
      beneficiarioParticipacion: sedeRecibe,
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 },
      _id: { $nin: vendidosLiquidados }
    })
      .populate("productoId", "descripcion codigo")
      .populate("actividadProductiva", "descripcion")
      .sort({ fecha: 1, factura: 1 })
      .lean();

    const ventas = pendientes.map(v => ({
      _id: v._id,
      fecha: v.createdAt,
      factura: v.factura,
      producto: v.productoId?.descripcion || v.descripcion || "",
      codigo: v.productoId?.codigo || v.codigo || "",
      actividad: v.actividadProductiva?.descripcion || "",
      cantidad: Number(v.cantidad || 0),
      totalVenta: Number(v.total || 0),
      tipoParticipacion: v.tipoParticipacion || "NINGUNA",
      valorParticipacion: Number(v.valorParticipacion || 0),
      montoParticipacion: Number(v.montoParticipacion || 0)
    }));

    const totalPendiente = Math.round((ventas.reduce((suma, v) => suma + v.montoParticipacion, 0) + Number.EPSILON) * 100) / 100;

    res.json({ ok: true, sedePaga, sedeRecibe, totalPendiente, cantidad: ventas.length, ventas });

  } catch (error) {
    console.error("Error consultando ventas pendientes de liquidar:", error);
    res.status(500).json({ ok: false, mensaje: "Error consultando las ventas pendientes de liquidar." });
  }
});

// ======================================================
// REGISTRAR PAGO / LIQUIDACIÓN DE PARTICIPACIÓN
// ======================================================
router.post("/pago", async (req, res) => {
  let gastoCreado = null, ingresoCreado = null, pagoCreado = null, facturaTiendita = null, contadorIncrementado = false;

  try {
    const { fecha, sedePaga, sedeRecibe, numeroReciboGasto, numeroReciboIngreso, observacion, usuario, vendidosSeleccionados } = req.body;

    if (!fecha || !sedePaga || !sedeRecibe || !numeroReciboGasto) return res.status(400).json({ ok: false, mensaje: "Debe completar fecha, sedes y número de recibo de gastos." });
    if (!SEDES_VALIDAS.includes(sedePaga) || !SEDES_VALIDAS.includes(sedeRecibe) || sedePaga === sedeRecibe) return res.status(400).json({ ok: false, mensaje: "Las sedes indicadas no son válidas." });
    if (!Array.isArray(vendidosSeleccionados) || vendidosSeleccionados.length === 0) return res.status(400).json({ ok: false, mensaje: "Debe seleccionar al menos una venta para liquidar." });

    const fechaNormalizada = fechaUTC(fecha);
    if (!fechaNormalizada) return res.status(400).json({ ok: false, mensaje: "Fecha inválida." });

    const reciboGasto = String(numeroReciboGasto).trim();
    const reciboIngreso = numeroReciboIngreso ? String(numeroReciboIngreso).trim() : "";

    if (!reciboGasto) return res.status(400).json({ ok: false, mensaje: "El número del recibo de gastos es obligatorio." });
    if (sedeRecibe === "MONASTERIO" && !reciboIngreso) return res.status(400).json({ ok: false, mensaje: "Debe indicar el número del recibo de ingreso del Monasterio." });

    const gastoExistente = await dbGastos.findOne({ sede: sedePaga, numeroRecibo: reciboGasto });
    if (gastoExistente) return res.status(400).json({ ok: false, mensaje: `Ya existe el recibo de gastos ${reciboGasto} en ${sedePaga}.` });

    const pagoConReciboGasto = await PagoParticipacion.findOne({ sedePaga, numeroReciboGasto: reciboGasto });
    if (pagoConReciboGasto) return res.status(400).json({ ok: false, mensaje: "Ese recibo de gastos ya fue utilizado en una liquidación." });

    if (sedeRecibe === "MONASTERIO") {
      const ingresoExistente = await ventas.findOne({ sede: "MONASTERIO", tipoMovimiento: "OTRO_INGRESO", numeroReciboIngreso: reciboIngreso });
      if (ingresoExistente) return res.status(400).json({ ok: false, mensaje: `Ya existe el recibo de ingreso ${reciboIngreso} en MONASTERIO.` });

      const pagoConReciboIngreso = await PagoParticipacion.findOne({ sedeRecibe: "MONASTERIO", numeroReciboIngreso: reciboIngreso });
      if (pagoConReciboIngreso) return res.status(400).json({ ok: false, mensaje: "Ese recibo de ingreso ya fue utilizado en una liquidación." });
    }

    const idsYaLiquidados = await PagoParticipacion.distinct("detalleVentas.vendido", { "detalleVentas.vendido": { $in: vendidosSeleccionados } });
    if (idsYaLiquidados.length > 0) return res.status(400).json({ ok: false, mensaje: "Una o más ventas seleccionadas ya fueron liquidadas. Actualice la pantalla e intente nuevamente." });

    const seleccionados = await Vendidos.find({
      _id: { $in: vendidosSeleccionados },
      sede: sedePaga,
      beneficiarioParticipacion: sedeRecibe,
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 }
    }).populate("productoId", "descripcion codigo").lean();

    if (seleccionados.length !== vendidosSeleccionados.length) return res.status(400).json({ ok: false, mensaje: "Una o más ventas seleccionadas no corresponden a esta liquidación." });

    const detalleVentas = seleccionados.map(v => ({
      vendido: v._id,
      factura: v.factura,
      fecha: v.createdAt,
      producto: v.productoId?.descripcion || "",
      cantidad: Number(v.cantidad || 0),
      totalVenta: Number(v.total || 0),
      tipoParticipacion: v.tipoParticipacion,
      valorParticipacion: Number(v.valorParticipacion || 0),
      montoParticipacion: Number(v.montoParticipacion || 0)
    }));

    const montoNumero = Math.round((detalleVentas.reduce((suma, v) => suma + v.montoParticipacion, 0) + Number.EPSILON) * 100) / 100;
    if (montoNumero <= 0) return res.status(400).json({ ok: false, mensaje: "Las ventas seleccionadas no generan participación." });

    gastoCreado = await dbGastos.create({
      fecha: fechaNormalizada, sede: sedePaga, descripcion: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
      clasificacion: "TRANSFERENCIA_PARTICIPACION", actividadProductiva: null, moneda: "D",
      monto: montoNumero, numeroRecibo: reciboGasto, cajaChica: false, usuario: usuario || "", cierre: "N"
    });

    const horaActual = new Intl.DateTimeFormat("en-US", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

    if (sedeRecibe === "TIENDITA") {
      facturaTiendita = await FacturaNro("TIENDITA") + 1;

      ingresoCreado = await ventas.create({
        fecha: fechaNormalizada, hora: horaActual, tipoMovimiento: "OTRO_INGRESO", factura: facturaTiendita,
        cliente: "", subtotal: montoNumero, IVA: 0, total: montoNumero, usuario: usuario || "ADMIN",
        estado: "CONTADO", numeroReciboIngreso: "", conceptoIngreso: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
        origenIngreso: "PARTICIPACION", sedeOrigenIngreso: sedePaga, sede: "TIENDITA", cierre: "N"
      });
    } else {
      ingresoCreado = await ventas.create({
        fecha: fechaNormalizada, hora: horaActual, tipoMovimiento: "OTRO_INGRESO", factura: null,
        cliente: "", subtotal: montoNumero, IVA: 0, total: montoNumero, usuario: usuario || "ADMIN",
        estado: "CONTADO", numeroReciboIngreso: reciboIngreso, conceptoIngreso: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
        origenIngreso: "PARTICIPACION", sedeOrigenIngreso: sedePaga, sede: "MONASTERIO", cierre: "N"
      });
    }

    pagoCreado = await PagoParticipacion.create({
      fecha: fechaNormalizada, sedePaga, sedeRecibe, monto: montoNumero, detalleVentas,
      numeroReciboGasto: reciboGasto, numeroReciboIngreso: sedeRecibe === "MONASTERIO" ? reciboIngreso : "",
      facturaIngresoTiendita: sedeRecibe === "TIENDITA" ? facturaTiendita : null,
      gastoGenerado: gastoCreado._id, ingresoGenerado: ingresoCreado._id,
      observacion: observacion?.trim() || "", usuario: usuario || ""
    });

    if (sedeRecibe === "TIENDITA") {
      await asignarFactura("TIENDITA");
      contadorIncrementado = true;
    }

    return res.json({
      ok: true,
      mensaje: "Liquidación registrada correctamente.",
      pago: pagoCreado,
      facturaTiendita,
      cantidadVentas: detalleVentas.length,
      monto: montoNumero
    });

  } catch (error) {
    console.error("Error registrando liquidación:", error);

    try {
      if (pagoCreado?._id) await PagoParticipacion.findByIdAndDelete(pagoCreado._id);
      if (ingresoCreado?._id) await ventas.findByIdAndDelete(ingresoCreado._id);
      if (gastoCreado?._id) await dbGastos.findByIdAndDelete(gastoCreado._id);
      if (contadorIncrementado) console.error("⚠️ Revisar contador de factura TIENDITA: fue incrementado antes de producirse un error.");
    } catch (rollbackError) {
      console.error("Error realizando rollback:", rollbackError);
    }

    return res.status(500).json({ ok: false, mensaje: error.message || "Error registrando la liquidación." });
  }
});

// ======================================================
// ESTADO DE CUENTA GENERAL
// ======================================================
router.get("/estado-cuenta", async (req, res) => {
  try {

    // --------------------------------------------------
    // 1. PARTICIPACIONES GENERADAS POR LAS VENTAS
    // --------------------------------------------------
    const vendidos = await Vendidos.find({
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 },
      beneficiarioParticipacion: {
        $in: SEDES_VALIDAS
      }
    });

    let monasterioDebeTiendita = 0;
    let tienditaDebeMonasterio = 0;

    for (const vendido of vendidos) {

      const monto =
        Number(
          vendido.montoParticipacion || 0
        );

      // MONASTERIO vendió y el beneficiario
      // es TIENDITA
      if (
        vendido.sede === "MONASTERIO" &&
        vendido.beneficiarioParticipacion ===
          "TIENDITA"
      ) {
        monasterioDebeTiendita += monto;
      }

      // TIENDITA vendió y el beneficiario
      // es MONASTERIO
      if (
        vendido.sede === "TIENDITA" &&
        vendido.beneficiarioParticipacion ===
          "MONASTERIO"
      ) {
        tienditaDebeMonasterio += monto;
      }
    }


    // --------------------------------------------------
    // 2. PAGOS REALIZADOS
    // --------------------------------------------------
    const pagos =
      await PagoParticipacion.find({});

    let pagadoMonasterioATiendita = 0;
    let pagadoTienditaAMonasterio = 0;

    for (const pago of pagos) {

      const monto =
        Number(pago.monto || 0);

      if (
        pago.sedePaga === "MONASTERIO" &&
        pago.sedeRecibe === "TIENDITA"
      ) {
        pagadoMonasterioATiendita += monto;
      }

      if (
        pago.sedePaga === "TIENDITA" &&
        pago.sedeRecibe === "MONASTERIO"
      ) {
        pagadoTienditaAMonasterio += monto;
      }
    }


    // --------------------------------------------------
    // 3. SALDOS BRUTOS
    // --------------------------------------------------
    const pendienteMonasterioATiendita =
      monasterioDebeTiendita -
      pagadoMonasterioATiendita;

    const pendienteTienditaAMonasterio =
      tienditaDebeMonasterio -
      pagadoTienditaAMonasterio;


    // --------------------------------------------------
    // 4. SALDO NETO ENTRE LAS DOS SEDES
    // Positivo = MONASTERIO debe a TIENDITA
    // Negativo = TIENDITA debe a MONASTERIO
    // --------------------------------------------------
    const saldoNeto =
      pendienteMonasterioATiendita -
      pendienteTienditaAMonasterio;

    let deudor = "NINGUNO";
    let acreedor = "NINGUNO";

    if (saldoNeto > 0) {
      deudor = "MONASTERIO";
      acreedor = "TIENDITA";
    }

    if (saldoNeto < 0) {
      deudor = "TIENDITA";
      acreedor = "MONASTERIO";
    }


    // --------------------------------------------------
    // 5. RESPUESTA
    // --------------------------------------------------
    return res.json({
      ok: true,

      generado: {
        monasterioATiendita:
          Math.round(
            (monasterioDebeTiendita +
              Number.EPSILON) *
              100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (tienditaDebeMonasterio +
              Number.EPSILON) *
              100
          ) / 100
      },

      pagado: {
        monasterioATiendita:
          Math.round(
            (pagadoMonasterioATiendita +
              Number.EPSILON) *
              100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (pagadoTienditaAMonasterio +
              Number.EPSILON) *
              100
          ) / 100
      },

      pendiente: {
        monasterioATiendita:
          Math.round(
            (pendienteMonasterioATiendita +
              Number.EPSILON) *
              100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (pendienteTienditaAMonasterio +
              Number.EPSILON) *
              100
          ) / 100
      },

      saldoNeto: {
        monto:
          Math.round(
            (Math.abs(saldoNeto) +
              Number.EPSILON) *
              100
          ) / 100,

        deudor,
        acreedor
      }
    });

  } catch (error) {
    console.error(
      "Error calculando estado de cuenta:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error calculando estado de cuenta."
    });
  }
});


// ======================================================
// HISTORIAL DE PAGOS
// ======================================================
router.get("/pagos", async (req, res) => {
  try {

    const pagos =
      await PagoParticipacion
        .find({})
        .sort({
          fecha: -1,
          createdAt: -1
        });

    return res.json({
      ok: true,
      pagos
    });

  } catch (error) {
    console.error(
      "Error consultando pagos de participación:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error consultando pagos de participación."
    });
  }
});


export default router;