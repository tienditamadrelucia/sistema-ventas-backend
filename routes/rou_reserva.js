import express from "express";
import FacturaReserva from "../models/FacturaReserva.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Ventas from "../models/dbVentas.js";
import Contador from "../models/Contador.js";

const router = express.Router();

/*
  ============================================================
  1) MARCAR RESERVA CON PAGO (solo para compatibilidad antigua)
  ============================================================
*/
router.post("/marcar-pago", async (req, res) => {
  try {
    const { numeroFactura } = req.body;
    if (!numeroFactura) {
      return res.status(400).json({ ok: false, msg: "Falta numeroFactura" });
    }

    const reserva = await FacturaReserva.findOne({ numero: numeroFactura });
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva no encontrada" });
    }

    reserva.pagoAsociado = true;
    await reserva.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error marcando pago en reserva:", error);
    return res.status(500).json({ ok: false, msg: "Error marcando pago asociado" });
  }
});

/*
  ============================================================
  2) CANCELAR RESERVA SIN PAGO (flujo antiguo)
  ============================================================
*/
router.delete("/cancelar-sin-pago/:reservaId", async (req, res) => {
  try {
    const { reservaId } = req.params;

    const reserva = await FacturaReserva.findById(reservaId);
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva no encontrada" });
    }

    if (reserva.estado !== "RESERVADA") {
      return res.status(400).json({ ok: false, msg: "Solo se pueden cancelar facturas reservadas" });
    }

    if (reserva.pagoAsociado) {
      return res.status(400).json({ ok: false, msg: "La factura tiene pago asociado" });
    }

    const numero = reserva.numero;

    await FacturaReserva.deleteOne({ _id: reservaId });

    // Retroceder contador SOLO si este número es el último
    const contador = await Contador.findOne({ tipo: "FACTURA" });
    if (contador.valor === numero) {
      contador.valor = contador.valor - 1;
      await contador.save();
    }

    return res.json({ ok: true, msg: "Factura cancelada y contador ajustado" });
  } catch (error) {
    console.error("Error cancelando factura sin pago:", error);
    return res.status(500).json({ ok: false, msg: "Error cancelando factura sin pago" });
  }
});

/*
  ============================================================
  3) CANCELAR RESERVA CON PAGO (flujo antiguo)
  ============================================================
*/
router.delete("/cancelar-con-pago/:reservaId", async (req, res) => {
  try {
    const { reservaId } = req.params;

    const reserva = await FacturaReserva.findById(reservaId);
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva no encontrada" });
    }

    if (reserva.estado !== "RESERVADA") {
      return res.status(400).json({ ok: false, msg: "Solo se pueden cancelar facturas reservadas" });
    }

    const numeroFactura = reserva.numero;

    // Eliminar pagos asociados
    await Moneda.deleteMany({ factura: numeroFactura });

    // Eliminar reserva
    await FacturaReserva.deleteOne({ _id: reservaId });

    // NO retroceder contador porque hubo pago
    return res.json({ ok: true, msg: "Factura con pago cancelada correctamente" });
  } catch (error) {
    console.error("Error cancelando factura con pago:", error);
    return res.status(500).json({ ok: false, msg: "Error cancelando factura con pago" });
  }
});

/*
  ============================================================
  4) ELIMINAR TODO (pago + venta + reserva + revertir contador)
     ⚠️ SOLO USAR SI LA FACTURA NO SE HA GUARDADO
  ============================================================
*/
router.delete("/eliminar-completa/:factura", async (req, res) => {
  try {
    const factura = Number(req.params.factura);

    // 1. Eliminar reserva (si existe)
    await FacturaReserva.findOneAndDelete({ numero: factura });

    // 2. Eliminar pagos
    await Moneda.deleteMany({ factura });

    // 3. Eliminar ventas y vendidos
    await Ventas.deleteMany({ factura });
    await Vendidos.deleteMany({ factura });

    // 4. Revertir contador SOLO si este número es el último
    const contador = await Contador.findOne({ tipo: "FACTURA" });
    if (contador.valor === factura) {
      await Contador.findOneAndUpdate(
        { tipo: "FACTURA" },
        { $inc: { valor: -1 } }
      );
    }

    return res.json({
      ok: true,
      mensaje: "Factura, pagos, vendidos y contador revertidos correctamente"
    });
  } catch (error) {
    console.error("Error eliminando factura completa:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error eliminando factura completa",
      detalle: error.message
    });
  }
});

/*
  ============================================================
  5) ELIMINAR RESERVA POR ID (compatibilidad)
  ============================================================
*/
router.delete("/eliminar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await FacturaReserva.findByIdAndDelete(id);
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva no encontrada" });
    }
    return res.json({ ok: true, msg: "Reserva eliminada" });
  } catch (error) {
    console.error("Error eliminando reserva:", error);
    return res.status(500).json({ ok: false, msg: "Error eliminando reserva" });
  }
});

export default router;
