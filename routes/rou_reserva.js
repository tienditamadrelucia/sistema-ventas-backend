import express from "express";

import FacturaReserva from "../models/FacturaReserva.js";
import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Ventas from "../models/dbVentas.js";
import Contador from "../models/Contador.js";

import {
  protegerFacturas
} from "../middleware/bloqueoVentas.js";

const router = express.Router();

router.use(protegerFacturas);

// =====================================================
// MARCAR RESERVA CON PAGO
// Compatibilidad con el flujo antiguo.
// =====================================================
router.post("/marcar-pago", async (req, res) => {
  try {
    const { numeroFactura } = req.body;

    if (!numeroFactura) {
      return res.status(400).json({
        ok: false,
        msg: "Falta numeroFactura"
      });
    }

    const reserva = await FacturaReserva.findOne({
      numero: numeroFactura
    }).session(req.cajaMongo);

    if (!reserva) {
      return res.status(404).json({
        ok: false,
        msg: "Reserva no encontrada"
      });
    }

    reserva.pagoAsociado = true;

    await reserva.save({
      session: req.cajaMongo
    });

    return res.json({
      ok: true
    });
  } catch {
    return res.status(500).json({
      ok: false,
      msg: "Error marcando pago asociado"
    });
  }
});

// =====================================================
// CANCELAR RESERVA SIN PAGO
// Compatibilidad con el flujo antiguo.
// =====================================================
router.delete(
  "/cancelar-sin-pago/:reservaId",
  async (req, res) => {
    try {
      const { reservaId } = req.params;

      const reserva = await FacturaReserva.findById(
        reservaId
      ).session(req.cajaMongo);

      if (!reserva) {
        return res.status(404).json({
          ok: false,
          msg: "Reserva no encontrada"
        });
      }

      if (reserva.estado !== "RESERVADA") {
        return res.status(400).json({
          ok: false,
          msg: "Solo se pueden cancelar facturas reservadas"
        });
      }

      if (reserva.pagoAsociado) {
        return res.status(400).json({
          ok: false,
          msg: "La factura tiene pago asociado"
        });
      }

      const numero = reserva.numero;

      await FacturaReserva.deleteOne({
        _id: reservaId
      }).session(req.cajaMongo);

      const contador = await Contador.findOne({
        tipo: "FACTURA"
      }).session(req.cajaMongo);

      if (contador && contador.valor === numero) {
        contador.valor -= 1;

        await contador.save({
          session: req.cajaMongo
        });
      }

      return res.json({
        ok: true,
        msg: "Factura cancelada y contador ajustado"
      });
    } catch {
      return res.status(500).json({
        ok: false,
        msg: "Error cancelando factura sin pago"
      });
    }
  }
);

// =====================================================
// CANCELAR RESERVA CON PAGO
// Compatibilidad con el flujo antiguo.
// =====================================================
router.delete(
  "/cancelar-con-pago/:reservaId",
  async (req, res) => {
    try {
      const { reservaId } = req.params;

      const reserva = await FacturaReserva.findById(
        reservaId
      ).session(req.cajaMongo);

      if (!reserva) {
        return res.status(404).json({
          ok: false,
          msg: "Reserva no encontrada"
        });
      }

      if (reserva.estado !== "RESERVADA") {
        return res.status(400).json({
          ok: false,
          msg: "Solo se pueden cancelar facturas reservadas"
        });
      }

      await Moneda.deleteMany({
        factura: reserva.numero
      }).session(req.cajaMongo);

      await FacturaReserva.deleteOne({
        _id: reservaId
      }).session(req.cajaMongo);

      return res.json({
        ok: true,
        msg: "Factura con pago cancelada correctamente"
      });
    } catch {
      return res.status(500).json({
        ok: false,
        msg: "Error cancelando factura con pago"
      });
    }
  }
);

// =====================================================
// ELIMINAR FACTURA COMPLETA POR SEDE
// El middleware comprueba todas las fechas afectadas.
// =====================================================
router.delete(
  "/eliminar-completa/:factura",
  async (req, res) => {
    try {
      const factura = Number(req.params.factura);
      const sede = req.query.sede || "TIENDITA";

      if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Sede inválida"
        });
      }

      // Las reservas antiguas corresponden a Tiendita.
      if (sede === "TIENDITA") {
        await FacturaReserva.findOneAndDelete({
          numero: factura
        }).session(req.cajaMongo);
      }

      await Moneda.deleteMany({
        factura,
        sede
      }).session(req.cajaMongo);

      await Ventas.deleteMany({
        factura,
        sede
      }).session(req.cajaMongo);

      await Vendidos.deleteMany({
        factura,
        sede
      }).session(req.cajaMongo);

      const tipoContador = sede === "MONASTERIO"
        ? "FACTURA_MONASTERIO"
        : "FACTURA_TIENDITA";

      const contador = await Contador.findOne({
        tipo: tipoContador
      }).session(req.cajaMongo);

      // Ajustar únicamente si es la última factura.
      if (contador && contador.valor === factura) {
        await Contador.findOneAndUpdate(
          {
            tipo: tipoContador
          },
          {
            $inc: {
              valor: -1
            }
          }
        ).session(req.cajaMongo);
      }

      return res.json({
        ok: true,
        mensaje:
          `Factura ${factura} de ${sede} ` +
          "eliminada correctamente"
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        mensaje: "Error eliminando factura completa",
        detalle: error.message
      });
    }
  }
);

// =====================================================
// ELIMINAR RESERVA POR ID
// Compatibilidad con el flujo antiguo.
// =====================================================
router.delete("/eliminar/:id", async (req, res) => {
  try {
    const reserva =
      await FacturaReserva.findByIdAndDelete(
        req.params.id
      ).session(req.cajaMongo);

    if (!reserva) {
      return res.status(404).json({
        ok: false,
        msg: "Reserva no encontrada"
      });
    }

    return res.json({
      ok: true,
      msg: "Reserva eliminada"
    });
  } catch {
    return res.status(500).json({
      ok: false,
      msg: "Error eliminando reserva"
    });
  }
});

export default router;