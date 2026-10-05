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
// REGISTRAR PAGO / LIQUIDACIÓN DE PARTICIPACIÓN
// ======================================================
router.post("/pago", async (req, res) => {

  let gastoCreado = null;
  let ingresoCreado = null;
  let pagoCreado = null;

  let facturaTiendita = null;
  let contadorIncrementado = false;

  try {

    const {
      fecha,
      sedePaga,
      sedeRecibe,
      monto,
      numeroReciboGasto,
      numeroReciboIngreso,
      observacion,
      usuario
    } = req.body;


    // ==================================================
    // 1. VALIDACIONES BÁSICAS
    // ==================================================
    if (
      !fecha ||
      !sedePaga ||
      !sedeRecibe ||
      !monto ||
      !numeroReciboGasto
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Debe completar fecha, sede que paga, sede que recibe, monto y número de recibo de gastos."
      });
    }


    if (
      !SEDES_VALIDAS.includes(sedePaga) ||
      !SEDES_VALIDAS.includes(sedeRecibe)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida."
      });
    }


    if (sedePaga === sedeRecibe) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "La sede que paga y la sede que recibe no pueden ser la misma."
      });
    }


    // ==================================================
    // 2. VALIDAR MONTO
    // ==================================================
    const montoNumero =
      Math.round(
        (Number(monto) + Number.EPSILON) * 100
      ) / 100;


    if (
      !Number.isFinite(montoNumero) ||
      montoNumero <= 0
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El monto debe ser mayor que cero."
      });
    }


    // ==================================================
    // 3. VALIDAR FECHA
    // ==================================================
    const fechaNormalizada =
      fechaUTC(fecha);


    if (!fechaNormalizada) {
      return res.status(400).json({
        ok: false,
        mensaje: "Fecha inválida."
      });
    }


    // ==================================================
    // 4. DOCUMENTOS
    // ==================================================
    const reciboGasto =
      String(numeroReciboGasto).trim();


    const reciboIngreso =
      numeroReciboIngreso
        ? String(numeroReciboIngreso).trim()
        : "";


    if (!reciboGasto) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "El número del recibo de gastos es obligatorio."
      });
    }


    // Si recibe MONASTERIO:
    // debe existir recibo de ingreso.
    if (
      sedeRecibe === "MONASTERIO" &&
      !reciboIngreso
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Debe indicar el número del recibo de ingreso del Monasterio."
      });
    }


    // ==================================================
    // 5. VERIFICAR RECIBO DE GASTOS
    // ==================================================
    const gastoExistente =
      await dbGastos.findOne({
        sede: sedePaga,
        numeroRecibo: reciboGasto
      });


    if (gastoExistente) {
      return res.status(400).json({
        ok: false,
        mensaje:
          `Ya existe el recibo de gastos ${reciboGasto} en ${sedePaga}.`
      });
    }


    const pagoConReciboGasto =
      await PagoParticipacion.findOne({
        sedePaga,
        numeroReciboGasto: reciboGasto
      });


    if (pagoConReciboGasto) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Ese recibo de gastos ya fue utilizado en una liquidación de participación."
      });
    }


    // ==================================================
    // 6. SI RECIBE MONASTERIO:
    // VERIFICAR RECIBO DE INGRESO
    // ==================================================
    if (sedeRecibe === "MONASTERIO") {

      const ingresoExistente =
        await ventas.findOne({
          sede: "MONASTERIO",
          tipoMovimiento: "OTRO_INGRESO",
          numeroReciboIngreso: reciboIngreso
        });


      if (ingresoExistente) {
        return res.status(400).json({
          ok: false,
          mensaje:
            `Ya existe el recibo de ingreso ${reciboIngreso} en MONASTERIO.`
        });
      }


      const pagoConReciboIngreso =
        await PagoParticipacion.findOne({
          sedeRecibe: "MONASTERIO",
          numeroReciboIngreso: reciboIngreso
        });


      if (pagoConReciboIngreso) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Ese recibo de ingreso ya fue utilizado en una liquidación de participación."
        });
      }
    }


    // ==================================================
    // 7. CALCULAR PARTICIPACIÓN GENERADA
    // ==================================================
    const vendidos =
      await Vendidos.find({
        sede: sedePaga,
        beneficiarioParticipacion: sedeRecibe,
        generaParticipacion: true,
        montoParticipacion: {
          $gt: 0
        }
      });


    const totalGenerado =
      vendidos.reduce(
        (acumulado, vendido) =>
          acumulado +
          Number(
            vendido.montoParticipacion || 0
          ),
        0
      );


    // ==================================================
    // 8. CALCULAR LO YA PAGADO
    // ==================================================
    const pagosAnteriores =
      await PagoParticipacion.find({
        sedePaga,
        sedeRecibe
      });


    const totalPagado =
      pagosAnteriores.reduce(
        (acumulado, pago) =>
          acumulado +
          Number(pago.monto || 0),
        0
      );


    const pendiente =
      Math.round(
        (
          totalGenerado -
          totalPagado +
          Number.EPSILON
        ) * 100
      ) / 100;


    // ==================================================
    // 9. VALIDAR SALDO
    // ==================================================
    if (pendiente <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje:
          `${sedePaga} no tiene participación pendiente por pagar a ${sedeRecibe}.`
      });
    }


    if (montoNumero > pendiente) {
      return res.status(400).json({
        ok: false,
        mensaje:
          `El pago no puede superar el saldo pendiente de $${pendiente.toFixed(2)}.`
      });
    }


    // ==================================================
    // 10. CREAR RECIBO DE GASTOS
    // EN LA SEDE QUE PAGA
    // ==================================================
    gastoCreado =
      await dbGastos.create({

        fecha: fechaNormalizada,

        sede: sedePaga,

        descripcion:
          "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",

        clasificacion:
          "TRANSFERENCIA_PARTICIPACION",

        actividadProductiva: null,

        moneda: "D",

        monto: montoNumero,

        numeroRecibo: reciboGasto,

        cajaChica: false,

        usuario: usuario || "",

        cierre: "N"
      });


    // ==================================================
    // 11. CREAR DOCUMENTO DE LA SEDE QUE RECIBE
    // ==================================================

    const horaActual =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: "America/Caracas",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      ).format(new Date());


    // ==================================================
    // 11-A. RECIBE TIENDITA
    // GENERAR FACTURA
    // ==================================================
    if (sedeRecibe === "TIENDITA") {

      // Utilizamos el mismo número actual
      // que utiliza el módulo normal de Ventas.
      facturaTiendita =
        await FacturaNro("TIENDITA");


      ingresoCreado =
        await ventas.create({

          fecha: fechaNormalizada,

          hora: horaActual,

          tipoMovimiento:
            "OTRO_INGRESO",

          factura:
            facturaTiendita,

          cliente: "",

          subtotal:
            montoNumero,

          IVA: 0,

          total:
            montoNumero,

          usuario:
            usuario || "ADMIN",

          estado:
            "CONTADO",

          numeroReciboIngreso: "",

          conceptoIngreso:
            "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",

          origenIngreso:
            "PARTICIPACION",

          sedeOrigenIngreso:
            sedePaga,

          sede:
            "TIENDITA",

          cierre:
            "N"
        });
    }


    // ==================================================
    // 11-B. RECIBE MONASTERIO
    // GENERAR RECIBO DE INGRESO
    // ==================================================
    if (sedeRecibe === "MONASTERIO") {

      ingresoCreado =
        await ventas.create({

          fecha: fechaNormalizada,

          hora: horaActual,

          tipoMovimiento:
            "OTRO_INGRESO",

          factura: null,

          cliente: "",

          subtotal:
            montoNumero,

          IVA: 0,

          total:
            montoNumero,

          usuario:
            usuario || "ADMIN",

          estado:
            "CONTADO",

          numeroReciboIngreso:
            reciboIngreso,

          conceptoIngreso:
            "LIQUIDACIÓN DE PARTICIPACIÓN POR VENTAS",

          origenIngreso:
            "PARTICIPACION",

          sedeOrigenIngreso:
            sedePaga,

          sede:
            "MONASTERIO",

          cierre:
            "N"
        });
    }


    // ==================================================
    // 12. GUARDAR LIQUIDACIÓN DE PARTICIPACIÓN
    // ==================================================
    pagoCreado =
      await PagoParticipacion.create({

        fecha:
          fechaNormalizada,

        sedePaga,

        sedeRecibe,

        monto:
          montoNumero,

        numeroReciboGasto:
          reciboGasto,

        numeroReciboIngreso:
          sedeRecibe === "MONASTERIO"
            ? reciboIngreso
            : "",

        facturaIngresoTiendita:
          sedeRecibe === "TIENDITA"
            ? facturaTiendita
            : null,

        gastoGenerado:
          gastoCreado._id,

        ingresoGenerado:
          ingresoCreado._id,

        observacion:
          observacion?.trim() || "",

        usuario:
          usuario || ""
      });


    // ==================================================
    // 13. SI RECIBIÓ TIENDITA:
    // AVANZAR CONTADOR DE FACTURA
    // ==================================================
    if (sedeRecibe === "TIENDITA") {

      await asignarFactura(
        "TIENDITA"
      );

      contadorIncrementado = true;
    }


    // ==================================================
    // 14. RESPUESTA
    // ==================================================
    return res.json({

      ok: true,

      mensaje:
        "Liquidación de participación registrada correctamente.",

      pago:
        pagoCreado,

      gasto:
        gastoCreado,

      ingreso:
        ingresoCreado,

      facturaTiendita:
        facturaTiendita,

      saldoAnterior:
        pendiente,

      saldoPendiente:
        Math.round(
          (
            pendiente -
            montoNumero +
            Number.EPSILON
          ) * 100
        ) / 100
    });


  } catch (error) {

    console.error(
      "Error registrando pago de participación:",
      error
    );


    // ==================================================
    // ROLLBACK MANUAL
    // ==================================================
    // Eliminamos los documentos creados si algo
    // falla antes de completar la operación.
    //
    // IMPORTANTE:
    // El contador se incrementa al final para reducir
    // el riesgo de dejar números saltados.
    // ==================================================
    try {

      if (pagoCreado?._id) {
        await PagoParticipacion.findByIdAndDelete(
          pagoCreado._id
        );
      }


      if (ingresoCreado?._id) {
        await ventas.findByIdAndDelete(
          ingresoCreado._id
        );
      }


      if (gastoCreado?._id) {
        await dbGastos.findByIdAndDelete(
          gastoCreado._id
        );
      }


      if (contadorIncrementado) {
        console.error(
          "⚠️ La operación falló después de incrementar el contador de factura. Revisar el contador de TIENDITA."
        );
      }

    } catch (rollbackError) {

      console.error(
        "🔴 Error realizando rollback:",
        rollbackError
      );
    }


    return res.status(500).json({

      ok: false,

      mensaje:
        error.message ||
        "Error registrando la liquidación de participación."
    });
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