
// REGISTRAR MOVIMIENTO DE MONEDA
import express from "express";
import Moneda from "../models/dbMoneda.js";
import {
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

import {
  protegerMoneda
} from "../middleware/bloqueoVentas.js";

const router = express.Router();

router.use(protegerMoneda);

// =====================================================
// REGISTRAR MOVIMIENTO
// =====================================================
router.post("/", async (req, res) => {
  try {
    const nuevo = new Moneda(req.body);

    await nuevo.save({
      session: req.cajaMongo
    });

    return res.json({
      ok: true,
      mensaje: "Movimiento registrado correctamente",
      moneda: nuevo
    });
  } catch (error) {
    let mensaje = "Error en el servidor";

    if (error?.errors?.fecha?.kind === "required") {
      mensaje = "Falta ingresar la fecha del pago";
    }

    return res.status(500).json({
      ok: false,
      mensaje,
      detalle: error.message
    });
  }
});

// =====================================================
// OBTENER TODOS LOS MOVIMIENTOS
// =====================================================
router.get("/", async (req, res) => {
  try {
    const lista = await Moneda.find()
      .session(req.cajaMongo)
      .sort({ createdAt: -1 });

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo movimientos"
    });
  }
});

// =====================================================
// BUSCAR POR RANGO
// Debe declararse antes de GET /:id.
// =====================================================
router.get("/rango", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    const inicio = new Date(desde);
    const fin = new Date(hasta);

    fin.setDate(fin.getDate() + 1);

    const lista = await Moneda.find({
      fecha: {
        $gte: inicio,
        $lt: fin
      }
    }).session(req.cajaMongo);

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando movimientos por rango"
    });
  }
});

// =====================================================
// BUSCAR POR FACTURA Y SEDE
// =====================================================
router.get("/factura/:numero", async (req, res) => {
  try {
    const { numero } = req.params;
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida"
      });
    }

    const filtroSede = sede === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    const lista = await Moneda.find({
      factura: numero,
      ...filtroSede
    })
      .session(req.cajaMongo)
      .sort({
        fecha: 1,
        createdAt: 1
      });

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando movimientos por factura"
    });
  }
});

// =====================================================
// BUSCAR POR FECHA
// =====================================================
router.get("/fecha/:dia", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";

    const dia = new Date(req.params.dia);
    const siguiente = new Date(dia);

    siguiente.setDate(siguiente.getDate() + 1);

    const lista = await Moneda.find({
      sede,
      fecha: {
        $gte: dia,
        $lt: siguiente
      }
    }).session(req.cajaMongo);

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando movimientos por fecha"
    });
  }
});

// =====================================================
// BUSCAR POR OPERACIÓN
// =====================================================
router.get("/operacion/:tipo", async (req, res) => {
  try {
    const tipo = req.params.tipo.toUpperCase();

    const lista = await Moneda.find({
      operacion: tipo
    }).session(req.cajaMongo);

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando movimientos por operación"
    });
  }
});

// =====================================================
// BUSCAR POR REFERENCIA
// =====================================================
router.get("/referencia/:ref", async (req, res) => {
  try {
    const ref = req.params.ref;

    const lista = await Moneda.find({
      $or: [
        { "referencia-P": ref },
        { "referencia-TBs": ref },
        { "referencia-PMBs": ref },
        { "referencia-Z": ref }
      ]
    }).session(req.cajaMongo);

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando por referencia"
    });
  }
});

// =====================================================
// BUSCAR POR BANCO
// =====================================================
router.get("/banco/:nombre", async (req, res) => {
  try {
    const banco = req.params.nombre.toUpperCase();

    const lista = await Moneda.find({
      $or: [
        { "banco-P": banco },
        { "banco-TBs": banco },
        { "banco-PMBs": banco },
        { "banco-Z": banco }
      ]
    }).session(req.cajaMongo);

    return res.json({
      ok: true,
      lista
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error buscando por banco"
    });
  }
});

// =====================================================
// OBTENER MOVIMIENTO POR ID
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const movimiento = await Moneda.findById(
      req.params.id
    ).session(req.cajaMongo);

    if (!movimiento) {
      return res.json({
        ok: false,
        mensaje: "Movimiento no encontrado"
      });
    }

    return res.json({
      ok: true,
      mov: movimiento
    });
  } catch {
    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo movimiento"
    });
  }
});

// =====================================================
// ACTUALIZAR MOVIMIENTO
// =====================================================
router.put("/:id", async (req, res) => {
  try {
        const original = await Moneda.findById(req.params.id)
      .session(req.cajaMongo);

    if (!original) {
      throw fallo(404, "Movimiento no encontrado.");
    }

    if (
      original.operacion === "ABONO DE CREDITO" &&
      req.body.operacion !== undefined &&
      req.body.operacion !== original.operacion
    ) {
      return res.status(409).json({
        ok: false,
        mensaje:
          "No puede cambiar el tipo de un abono de crédito."
      });
    }
    const actualizado = await Moneda.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true
      }
    ).session(req.cajaMongo);

    if (!actualizado) {
      return res.status(404).json({
        ok: false,
        mensaje: "Documento no encontrado"
      });
    }

    return res.json({
      ok: true,
      moneda: actualizado
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
});

// =====================================================
// ELIMINAR MOVIMIENTO
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const session = req.cajaMongo;

    if (!session?.inTransaction()) {
      throw fallo(
        500,
        "Falta la protección transaccional."
      );
    }

    const movimiento = await Moneda.findById(req.params.id)
      .session(session);

    if (!movimiento) {
      throw fallo(404, "Movimiento no encontrado.");
    }

    if (movimiento.operacion === "ABONO DE CREDITO") {
      if (req.usuarioCaja?.rol !== "ADMINISTRADOR") {
        throw fallo(
          403,
          "Solo el administrador puede eliminar abonos."
        );
      }

      const sedeMovimiento =
        movimiento.sede || "TIENDITA";

      const facturaSolicitada = Number(req.query.factura);

      if (
        !Number.isSafeInteger(facturaSolicitada) ||
        facturaSolicitada !== movimiento.factura ||
        req.query.sede !== sedeMovimiento
      ) {
        throw fallo(
          409,
          "El abono no corresponde a la factura y sede consultadas."
        );
      }

      // Si hay un vuelto ese día, no podemos determinar
      // automáticamente si pertenece a este abono.
      const inicio = new Date(movimiento.fecha);

      inicio.setUTCHours(0, 0, 0, 0);

      const fin = new Date(inicio);
      fin.setUTCDate(fin.getUTCDate() + 1);

      const filtroSede =
        sedeMovimiento === "MONASTERIO"
          ? { sede: "MONASTERIO" }
          : {
              $or: [
                { sede: "TIENDITA" },
                { sede: { $exists: false } }
              ]
            };

      const vuelto = await Moneda.exists({
        factura: movimiento.factura,
        operacion: "VUELTOS",
        fecha: {
          $gte: inicio,
          $lt: fin
        },
        ...filtroSede
      }).session(session);

      if (vuelto) {
        throw fallo(
          409,
          "Esta factura tiene un vuelto registrado el mismo día. Debe revisarse junto con el abono antes de eliminarlo."
        );
      }
    }

    const eliminado = await Moneda.findOneAndDelete({
      _id: movimiento._id,
      operacion: movimiento.operacion,
      factura: movimiento.factura
    }).session(session);

    if (!eliminado) {
      throw fallo(
        409,
        "El movimiento cambió. Actualice la consulta."
      );
    }

    return res.json({
      ok: true,
      mensaje: "Movimiento eliminado correctamente",
      eliminado
    });
  } catch (error) {
    return responderFallo(res, error);
  }
});

export default router;