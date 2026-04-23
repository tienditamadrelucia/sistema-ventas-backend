import express from "express";
import FacturaReserva from "../models/FacturaReserva.js";
import Vendidos from "../models/dbVendidos.js";  // tu modelo vendidos
import Moneda from "../models/dbMoneda.js";      // tu modelo Moneda
import { obtenerFactura } from "../utils/obtenerFactura.js";
import Ventas from "../models/dbVentas.js";
import Contador from "../models/Contador.js";

const router = express.Router();

/**
 * 1) Reservar número de factura al abrir una venta
 * POST /api/facturas/reservar
 */
router.post("/reservar", async (req, res) => {
  try {
    const numero = await obtenerFactura();
    console.log("router: reservar")

    const reserva = new FacturaReserva({
      numero,
      estado: "RESERVADA",
      pagoAsociado: false
    });

    await reserva.save();

    return res.json({
      ok: true,
      reservaId: reserva._id,
      numeroFactura: numero
    });
  } catch (error) {
    console.error("Error reservando factura:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error reservando número de factura"
    });
  }
});

/**
 * 2) Finalizar venta: crear documentos en ventas y vendidos
 *    y marcar la reserva como FINALIZADA
 * POST /api/facturas/finalizar
 */
router.post("/finalizar", async (req, res) => {
  try {
    const {
      reservaId,
      fecha,
      hora,
      cliente,
      subtotal,
      IVA,
      total,
      usuario,
      productos // array de { productoId, cantidad, precio, dscto, total }
    } = req.body;
    if (!reservaId) {
      return res.status(400).json({ ok: false, msg: "Falta reservaId" });
    }
    const reserva = await FacturaReserva.findById(reservaId);
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva de factura no encontrada" });
    }
    if (reserva.estado === "FINALIZADA") {
      return res.status(400).json({ ok: false, msg: "La factura ya fue finalizada" });
    }
    const numeroFactura = reserva.numero;
    // Crear documento en ventas
    const venta = new Ventas({
      fecha: fecha ? new Date(fecha) : new Date(),
      hora,
      factura: numeroFactura,
      cliente,
      subtotal,
      IVA,
      total,
      usuario
    });
    await venta.save();
    // Crear documentos en vendidos
    if (Array.isArray(productos) && productos.length > 0) {
      const docsVendidos = productos.map((p) => ({
        factura: numeroFactura,
        productoId: p.productoId,
        cantidad: p.cantidad,
        precio: p.precio,
        dscto: p.dscto || 0,
        total: p.total
      }));
      await Vendidos.insertMany(docsVendidos);
    }
    // Eliminar reserva como FINALIZADA
    await FacturaReserva.findByIdAndDelete(reservaId);
    return res.json({
      ok: true,
      numeroFactura,
      ventaId: venta._id
    });
  } catch (error) {
    console.error("Error finalizando factura:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error finalizando factura"
    });
  }
});

/**
 * 3) Marcar reserva con pago asociado
 *    (esto lo llamas desde la ruta donde ya grabas Moneda)
 * POST /api/facturas/marcar-pago
 */
router.post("/marcar-pago", async (req, res) => {
  console.log("router: marcar-pago")
  try {
    const { numeroFactura } = req.body;

    if (!numeroFactura) {
      return res.status(400).json({ ok: false, msg: "Falta numeroFactura" });
    }

    const reserva = await FacturaReserva.findOne({ numero: numeroFactura });
    if (!reserva) {
      return res.status(404).json({ ok: false, msg: "Reserva no encontrada para ese número" });
    }

    reserva.pagoAsociado = true;
    await reserva.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error marcando pago en reserva:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error marcando pago asociado"
    });
  }
});

/**
 * 4) Cancelar factura RESERVADA sin pago
 *    DELETE /api/facturas/cancelar-sin-pago/:reservaId
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
      return res.status(400).json({ ok: false, msg: "La factura tiene pago asociado, use la ruta de cancelación con pago" });
    }

    await FacturaReserva.deleteOne({ _id: reservaId });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error cancelando factura sin pago:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error cancelando factura sin pago"
    });
  }
});

/**
 * 5) Cancelar factura RESERVADA con pago:
 *    - Eliminar pagos en Moneda
 *    - Eliminar reserva
 *    DELETE /api/facturas/cancelar-con-pago/:reservaId
 */
router.delete("/cancelar-con-pago/:reservaId", async (req, res) => {
  console.log("router: cancelar-con-pago")
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
    // Eliminar pagos asociados en Moneda
    await Moneda.deleteMany({ factura: numeroFactura });
    // Eliminar reserva
    await FacturaReserva.deleteOne({ _id: reservaId });
    return res.json({ ok: true });
  } catch (error) {
    console.error("Error cancelando factura con pago:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error cancelando factura con pago"
    });
  }
});

router.delete("/eliminar-completa/:factura", async (req, res) => {    
  try {
    const factura = Number(req.params.factura);

    // 1. Eliminar reserva (usa numero)
    await FacturaReserva.findOneAndDelete({ numero: factura });

    // 2. Eliminar pagos
    console.log("router: eliminar-completa ", factura)
    await Moneda.deleteMany({ factura});

    // 3. Eliminar vueltos
    //await Moneda.deleteMany({ factura, operacion: "VUELTOS" });

    // 4. Eliminar movimientos de ventas
    await Ventas.deleteMany({ factura });

    // 5. Revertir contador (NO eliminarlo)
    await Contador.findOneAndUpdate(
      { tipo: "FACTURA" },
      { $inc: { valor: -1 } }
    );

    return res.json({
      ok: true,
      mensaje: "Factura, pagos, vueltos, reserva y contador revertido correctamente"
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: "Error eliminando factura completa",
      detalle: error.message
    });
  }
});

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
