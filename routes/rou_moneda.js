
// REGISTRAR MOVIMIENTO DE MONEDA
import express from "express";
import Moneda from "../models/dbMoneda.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    console.log("📥 RECIBIDO EN BACKEND:", req.body);
    const nuevo = new Moneda(req.body);
    await nuevo.save();
    return res.json({
      ok: true,
      mensaje: "Movimiento registrado correctamente",
      moneda: nuevo
    });
  } catch (error) {
  console.error("❌ ERROR GUARDANDO MONEDA:", error);

  let mensaje = "Error en el servidor";

  // Detectar error específico de fecha requerida
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

// OBTENER TODOS LOS MOVIMIENTOS (opcional)
router.get("/", async (req, res) => {
  try {
    const lista = await Moneda.find().sort({ createdAt: -1 });
    return res.json({ ok: true, lista });
  } catch (error) {
    console.error("Error obteniendo movimientos:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor"
    });
  }
});

// OBTENER MOVIMIENTO POR ID (opcional)
router.get("/:id", async (req, res) => {
  try {
    const mov = await Moneda.findById(req.params.id);
    if (!mov) {
      return res.json({ ok: false, mensaje: "Movimiento no encontrado" });
    }
    return res.json({ ok: true, mov });
  } catch (error) {
    console.error("Error obteniendo movimiento:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error en el servidor"
    });
  }
});

// BUSCAR MOVIMIENTOS POR FACTURA
router.get("/factura/:numero", async (req, res) => {
  try {
    const numero = req.params.numero;
    const lista = await Moneda.find({ factura: numero });

    return res.json({ ok: true, lista });

  } catch (error) {
    console.error("Error buscando movimientos por factura:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// BUSCAR MOVIMIENTOS POR FECHA EXACTA
router.get("/fecha/:dia", async (req, res) => {
  try {
    const dia = new Date(req.params.dia);
    const siguiente = new Date(dia);
    siguiente.setDate(siguiente.getDate() + 1);

    const lista = await Moneda.find({
      fecha: { $gte: dia, $lt: siguiente }
    });

    return res.json({ ok: true, lista });

  } catch (error) {
    console.error("Error buscando movimientos por fecha:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// BUSCAR MOVIMIENTOS POR RANGO DE FECHAS
router.get("/rango", async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    const inicio = new Date(desde);
    const fin = new Date(hasta);
    fin.setDate(fin.getDate() + 1);

    const lista = await Moneda.find({
      fecha: { $gte: inicio, $lt: fin }
    });

    return res.json({ ok: true, lista });

  } catch (error) {
    console.error("Error buscando movimientos por rango:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// BUSCAR MOVIMIENTOS POR OPERACIÓN
router.get("/operacion/:tipo", async (req, res) => {
  try {
    const tipo = req.params.tipo.toUpperCase();
    const lista = await Moneda.find({ operacion: tipo });

    return res.json({ ok: true, lista });

  } catch (error) {
    console.error("Error buscando movimientos por operación:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// BUSCAR MOVIMIENTOS POR REFERENCIA
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
    });

    return res.json({ ok: true, lista });

  } catch (error) {
    console.error("Error buscando por referencia:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// BUSCAR MOVIMIENTOS POR BANCO
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
    });
    return res.json({ ok: true, lista });
  } catch (error) {
    console.error("Error buscando por banco:", error);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  }
});

// ACTUALIZAR MOVIMIENTO
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const actualizado = await Moneda.findByIdAndUpdate(
      id,
      data,
      { new: true }
    );
    if (!actualizado) {
      return res.status(404).json({ ok: false, mensaje: "Documento no encontrado" });
    }
    return res.json({ ok: true, moneda: actualizado });
  } catch (error) {
    console.error("❌ ERROR ACTUALIZANDO MONEDA:", error);
    return res.status(500).json({ ok: false, mensaje: error.message });
  }
});

// ELIMINAR MOVIMIENTO
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const eliminado = await Moneda.findByIdAndDelete(id);
    return res.json({ ok: true, eliminado });
  } catch (error) {
    console.error("❌ ERROR ELIMINANDO MONEDA:", error);
    return res.status(500).json({ ok: false, mensaje: error.message });
  }
});

export default router;
