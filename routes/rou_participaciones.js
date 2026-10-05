import express from "express";
import Vendidos from "../models/dbVendidos.js";
import PagoParticipacion from "../models/dbPagoParticipacion.js";
import dbGastos from "../models/dbGastos.js";
import ventas from "../models/dbVentas.js";
import { FacturaNro, asignarFactura } from "../controllers/con_ventas.js";
import Moneda from "../models/dbMoneda.js";
import dbIngresos from "../models/dbIngresos.js";
import TipoIngreso from "../models/dbTipoIngresos.js";

const router = express.Router();

const SEDES_VALIDAS = ["TIENDITA", "MONASTERIO"];

// ======================================================
// NORMALIZAR FECHA YYYY-MM-DD
// Evita el problema de retroceder un día en Venezuela
// ======================================================
function fechaUTC(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const [year, month, day] = fecha.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

// ======================================================
// VENTAS PENDIENTES DE LIQUIDAR
// ======================================================
router.get("/ventas-pendientes", async (req, res) => {
  try {
    const { sedePaga, sedeRecibe } = req.query;

    if (
      !SEDES_VALIDAS.includes(sedePaga) ||
      !SEDES_VALIDAS.includes(sedeRecibe) ||
      sedePaga === sedeRecibe
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Las sedes indicadas no son válidas."
      });
    }

    const pagos = await PagoParticipacion
      .find({ sedePaga, sedeRecibe })
      .select("detalleVentas.vendido")
      .lean();

    const vendidosLiquidados = pagos.flatMap(p =>
      (p.detalleVentas || []).map(d => d.vendido).filter(Boolean)
    );

    const pendientes = await Vendidos.find({
      sede: sedePaga,
      beneficiarioParticipacion: sedeRecibe,
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 },
      _id: { $nin: vendidosLiquidados }
    })
      .populate("productoId", "descripcion codigo")
      .populate("actividadProductiva", "descripcion")
      .sort({ createdAt: 1, factura: 1 })
      .lean();

    const ventasPendientes = pendientes.map(v => ({
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

    const totalPendiente =
      Math.round(
        (ventasPendientes.reduce(
          (suma, v) => suma + v.montoParticipacion,
          0
        ) + Number.EPSILON) * 100
      ) / 100;

    res.json({
      ok: true,
      sedePaga,
      sedeRecibe,
      totalPendiente,
      cantidad: ventasPendientes.length,
      ventas: ventasPendientes
    });

  } catch (error) {
    console.error("Error consultando ventas pendientes de liquidar:", error);

    res.status(500).json({
      ok: false,
      mensaje: "Error consultando las ventas pendientes de liquidar."
    });
  }
});

// ======================================================
// REGISTRAR PAGO / LIQUIDACIÓN DE PARTICIPACIÓN
// ======================================================
router.post("/pago", async (req, res) => {
  let gastoCreado = null;
  let ingresoCreado = null;
  let monedaCreada = null;
  let pagoCreado = null;
  let facturaTiendita = null;
  let contadorIncrementado = false;

  try {
    const {
      fecha,
      sedePaga,
      sedeRecibe,
      numeroReciboGasto,
      numeroReciboIngreso,
      observacion,
      usuario,
      vendidosSeleccionados
    } = req.body;

    if (!fecha || !sedePaga || !sedeRecibe || !numeroReciboGasto) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe completar fecha, sedes y número de recibo de gastos."
      });
    }

    if (
      !SEDES_VALIDAS.includes(sedePaga) ||
      !SEDES_VALIDAS.includes(sedeRecibe) ||
      sedePaga === sedeRecibe
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Las sedes indicadas no son válidas."
      });
    }

    if (
      !Array.isArray(vendidosSeleccionados) ||
      vendidosSeleccionados.length === 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe seleccionar al menos una venta para liquidar."
      });
    }

    const fechaNormalizada = fechaUTC(fecha);

    if (!fechaNormalizada) {
      return res.status(400).json({
        ok: false,
        mensaje: "Fecha inválida."
      });
    }

    const reciboGasto = String(numeroReciboGasto).trim();
    const reciboIngreso = numeroReciboIngreso
      ? String(numeroReciboIngreso).trim()
      : "";

    if (!reciboGasto) {
      return res.status(400).json({
        ok: false,
        mensaje: "El número del recibo de gastos es obligatorio."
      });
    }

    if (sedeRecibe === "MONASTERIO" && !reciboIngreso) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe indicar el número del recibo de ingreso del Monasterio."
      });
    }

    // ==================================================
    // VALIDAR RECIBO DE GASTOS
    // ==================================================
    const gastoExistente = await dbGastos.findOne({
      sede: sedePaga,
      numeroRecibo: reciboGasto
    });

    if (gastoExistente) {
      return res.status(400).json({
        ok: false,
        mensaje: `Ya existe el recibo de gastos ${reciboGasto} en ${sedePaga}.`
      });
    }

    const pagoConReciboGasto = await PagoParticipacion.findOne({
      sedePaga,
      numeroReciboGasto: reciboGasto
    });

    if (pagoConReciboGasto) {
      return res.status(400).json({
        ok: false,
        mensaje: "Ese recibo de gastos ya fue utilizado en una liquidación."
      });
    }

    // ==================================================
    // VALIDAR RECIBO DE INGRESO DEL MONASTERIO
    // ==================================================
    if (sedeRecibe === "MONASTERIO") {
      const ingresoExistente = await dbIngresos.findOne({
        sede: "MONASTERIO",
        numeroReciboIngreso: reciboIngreso
      });

      if (ingresoExistente) {
        return res.status(400).json({
          ok: false,
          mensaje: `Ya existe el recibo de ingreso ${reciboIngreso} en MONASTERIO.`
        });
      }

      const pagoConReciboIngreso = await PagoParticipacion.findOne({
        sedeRecibe: "MONASTERIO",
        numeroReciboIngreso: reciboIngreso
      });

      if (pagoConReciboIngreso) {
        return res.status(400).json({
          ok: false,
          mensaje: "Ese recibo de ingreso ya fue utilizado en una liquidación."
        });
      }
    }

    // ==================================================
    // VERIFICAR QUE LAS VENTAS NO ESTÉN LIQUIDADAS
    // ==================================================
    const idsYaLiquidados = await PagoParticipacion.distinct(
      "detalleVentas.vendido",
      {
        "detalleVentas.vendido": {
          $in: vendidosSeleccionados
        }
      }
    );

    if (idsYaLiquidados.length > 0) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Una o más ventas seleccionadas ya fueron liquidadas. Actualice la pantalla e intente nuevamente."
      });
    }

    // ==================================================
    // OBTENER VENTAS SELECCIONADAS
    // ==================================================
    const seleccionados = await Vendidos.find({
      _id: { $in: vendidosSeleccionados },
      sede: sedePaga,
      beneficiarioParticipacion: sedeRecibe,
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 }
    })
      .populate("productoId", "descripcion codigo")
      .lean();

    if (seleccionados.length !== vendidosSeleccionados.length) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Una o más ventas seleccionadas no corresponden a esta liquidación."
      });
    }

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

    const montoNumero =
      Math.round(
        (detalleVentas.reduce(
          (suma, v) => suma + v.montoParticipacion,
          0
        ) + Number.EPSILON) * 100
      ) / 100;

    if (montoNumero <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "Las ventas seleccionadas no generan participación."
      });
    }

    // ==================================================
    // CREAR GASTO EN LA SEDE QUE PAGA
    // ==================================================
    gastoCreado = await dbGastos.create({
      fecha: fechaNormalizada,
      sede: sedePaga,
      descripcion: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
      clasificacion: "TRANSFERENCIA_PARTICIPACION",
      actividadProductiva: null,
      moneda: "D",
      monto: montoNumero,
      numeroRecibo: reciboGasto,
      cajaChica: false,
      usuario: usuario || "",
      cierre: "N"
    });

    const horaActual = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());

    // ==================================================
    // SI RECIBE TIENDITA
    // Se conserva el funcionamiento que ya fue probado
    // ==================================================
    if (sedeRecibe === "TIENDITA") {
      facturaTiendita = await FacturaNro("TIENDITA") + 1;

      ingresoCreado = await ventas.create({
        fecha: fechaNormalizada,
        hora: horaActual,
        tipoMovimiento: "OTRO_INGRESO",
        factura: facturaTiendita,
        cliente: "",
        subtotal: montoNumero,
        IVA: 0,
        total: montoNumero,
        usuario: usuario || "ADMIN",
        estado: "CONTADO",
        numeroReciboIngreso: "",
        conceptoIngreso: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
        origenIngreso: "PARTICIPACION",
        sedeOrigenIngreso: sedePaga,
        sede: "TIENDITA",
        cierre: "N"
      });

      monedaCreada = await Moneda.create({
        fecha: fechaNormalizada,
        sede: "TIENDITA",
        operacion: "VENTA",
        factura: facturaTiendita,
        total: montoNumero,
        efectivoD: montoNumero
      });

    // ==================================================
    // SI RECIBE MONASTERIO
    // Crear verdadero INGRESO DEL MONASTERIO
    // ==================================================
    } else {
      const tipoParticipacion = await TipoIngreso.findOne({
        descripcion: "PARTICIPACIÓN DE TIENDITA"
      });

      if (!tipoParticipacion) {
        throw new Error(
          'Debe crear primero el tipo de ingreso "PARTICIPACIÓN DE TIENDITA".'
        );
      }

      ingresoCreado = await dbIngresos.create({
        fecha: fechaNormalizada,
        sede: "MONASTERIO",
        numeroReciboIngreso: reciboIngreso,
        tipoIngreso: tipoParticipacion._id,
        descripcion: "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",
        moneda: "D",
        monto: montoNumero,
        origen: "PARTICIPACION",
        pagoParticipacion: null,
        usuario: usuario || "",
        cierre: "N"
      });
    }

    // ==================================================
    // CREAR PAGO DE PARTICIPACIÓN
    // ==================================================
    pagoCreado = await PagoParticipacion.create({
      fecha: fechaNormalizada,
      sedePaga,
      sedeRecibe,
      monto: montoNumero,
      detalleVentas,
      numeroReciboGasto: reciboGasto,
      numeroReciboIngreso:
        sedeRecibe === "MONASTERIO" ? reciboIngreso : "",
      facturaIngresoTiendita:
        sedeRecibe === "TIENDITA" ? facturaTiendita : null,
      gastoGenerado: gastoCreado._id,
      ingresoGenerado: ingresoCreado._id,
      observacion: observacion?.trim() || "",
      usuario: usuario || ""
    });

    // ==================================================
    // ENLAZAR INGRESO DEL MONASTERIO CON EL PAGO
    // ==================================================
    if (sedeRecibe === "MONASTERIO") {
      ingresoCreado.pagoParticipacion = pagoCreado._id;
      await ingresoCreado.save();
    }

    // ==================================================
    // INCREMENTAR CONTADOR SOLO SI RECIBE TIENDITA
    // ==================================================
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

    // ==================================================
    // ROLLBACK
    // ==================================================
    try {
      if (pagoCreado?._id) {
        await PagoParticipacion.findByIdAndDelete(pagoCreado._id);
      }

      if (monedaCreada?._id) {
        await Moneda.findByIdAndDelete(monedaCreada._id);
      }

      if (ingresoCreado?._id) {
        if (sedeRecibe === "TIENDITA") {
          await ventas.findByIdAndDelete(ingresoCreado._id);
        } else {
          await dbIngresos.findByIdAndDelete(ingresoCreado._id);
        }
      }

      if (gastoCreado?._id) {
        await dbGastos.findByIdAndDelete(gastoCreado._id);
      }

      if (contadorIncrementado) {
        console.error(
          "⚠️ Revisar contador de factura TIENDITA: fue incrementado antes de producirse un error."
        );
      }

    } catch (rollbackError) {
      console.error("Error realizando rollback:", rollbackError);
    }

    return res.status(500).json({
      ok: false,
      mensaje:
        error.message || "Error registrando la liquidación."
    });
  }
});

// ======================================================
// ESTADO DE CUENTA GENERAL
// ======================================================
router.get("/estado-cuenta", async (req, res) => {
  try {
    const vendidos = await Vendidos.find({
      generaParticipacion: true,
      montoParticipacion: { $gt: 0 },
      beneficiarioParticipacion: { $in: SEDES_VALIDAS }
    });

    let monasterioDebeTiendita = 0;
    let tienditaDebeMonasterio = 0;

    for (const vendido of vendidos) {
      const monto = Number(vendido.montoParticipacion || 0);

      if (
        vendido.sede === "MONASTERIO" &&
        vendido.beneficiarioParticipacion === "TIENDITA"
      ) {
        monasterioDebeTiendita += monto;
      }

      if (
        vendido.sede === "TIENDITA" &&
        vendido.beneficiarioParticipacion === "MONASTERIO"
      ) {
        tienditaDebeMonasterio += monto;
      }
    }

    const pagos = await PagoParticipacion.find({});

    let pagadoMonasterioATiendita = 0;
    let pagadoTienditaAMonasterio = 0;

    for (const pago of pagos) {
      const monto = Number(pago.monto || 0);

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

    const pendienteMonasterioATiendita =
      monasterioDebeTiendita - pagadoMonasterioATiendita;

    const pendienteTienditaAMonasterio =
      tienditaDebeMonasterio - pagadoTienditaAMonasterio;

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

    return res.json({
      ok: true,

      generado: {
        monasterioATiendita:
          Math.round(
            (monasterioDebeTiendita + Number.EPSILON) * 100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (tienditaDebeMonasterio + Number.EPSILON) * 100
          ) / 100
      },

      pagado: {
        monasterioATiendita:
          Math.round(
            (pagadoMonasterioATiendita + Number.EPSILON) * 100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (pagadoTienditaAMonasterio + Number.EPSILON) * 100
          ) / 100
      },

      pendiente: {
        monasterioATiendita:
          Math.round(
            (pendienteMonasterioATiendita + Number.EPSILON) * 100
          ) / 100,

        tienditaAMonasterio:
          Math.round(
            (pendienteTienditaAMonasterio + Number.EPSILON) * 100
          ) / 100
      },

      saldoNeto: {
        monto:
          Math.round(
            (Math.abs(saldoNeto) + Number.EPSILON) * 100
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
      mensaje: "Error calculando estado de cuenta."
    });
  }
});

// ======================================================
// HISTORIAL DE PAGOS
// ======================================================
router.get("/pagos", async (req, res) => {
  try {
    const pagos = await PagoParticipacion
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
      mensaje: "Error consultando pagos de participación."
    });
  }
});

export default router;