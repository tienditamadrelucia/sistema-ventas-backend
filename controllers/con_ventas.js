import Venta from "../models/dbVentas.js";
import Vendido from "../models/dbVendidos.js";

export const crearVenta = async (req, res) => {
  try {
    const venta = new Venta(req.body);
    const guardada = await venta.save();
    res.json({
      ok: true,
      idVenta: guardada._id
    });
  } catch (error) {
    console.error("Error creando venta:", error);
    res.status(500).json({ ok: false, error: "Error al guardar la venta" });
  }
};

export const obtenerVentas = async (req, res) => {
  try {
    const ventas = await Venta.find().sort({ createdAt: -1 });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener ventas" });
  }
};

// ⭐ NUEVO CONTROLADOR
export const buscarVentaPorNumero = async (req, res) => {
  try {
    const numero = req.params.Factura;    
    const venta = await Venta.findOne({ Factura: numero });
    if (!venta) {
      return res.json({ ok: false, mensaje: "Factura no encontrada" });
    }
    return res.json({ ok: true, venta });
  } catch (error) {
    console.error("Backend dice: Error consultando factura:", error);
    return res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
};

