import express from "express";
import Vendidos from "../models/dbVendidos.js";
import PagoParticipacion from "../models/dbPagoParticipacion.js";

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
// REGISTRAR PAGO / ENTREGA DE PARTICIPACIÓN
// ======================================================
router.post("/pago", async (req, res) => {
  try {
    const {
      fecha,
      sedePaga,
      sedeRecibe,
      monto,
      observacion,
      usuario
    } = req.body;

    if (
      !fecha ||
      !sedePaga ||
      !sedeRecibe ||
      !monto
    ) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Debe completar fecha, sede que paga, sede que recibe y monto."
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

    const montoNumero = Number(monto);

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

    const fechaNormalizada =
      fechaUTC(fecha);

    if (!fechaNormalizada) {
      return res.status(400).json({
        ok: false,
        mensaje: "Fecha inválida."
      });
    }

    const pago =
      await PagoParticipacion.create({
        fecha: fechaNormalizada,
        sedePaga,
        sedeRecibe,
        monto:
          Math.round(
            (montoNumero + Number.EPSILON) *
              100
          ) / 100,
        observacion:
          observacion?.trim() || "",
        usuario: usuario || ""
      });

    return res.json({
      ok: true,
      mensaje:
        "Pago de participación registrado.",
      pago
    });

  } catch (error) {
    console.error(
      "Error registrando pago de participación:",
      error
    );

    return res.status(500).json({
      ok: false,
      mensaje:
        "Error registrando pago de participación."
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