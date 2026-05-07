import ventas from "../models/dbVentas.js";
import Vendido from "../models/dbVendidos.js";
import Contador from "../models/Contador.js";

export async function FacturaNro() {
  const doc = await Contador.findOne({ tipo: "FACTURA" });
  return doc.valor; // ← NO incrementa
}

export async function asignarFactura() {
  const doc = await Contador.findOneAndUpdate(
    { tipo: "FACTURA" },
    { $inc: { valor: 1 } },
    { new: true, upsert: true }
  );
  return doc.valor;
}

export const crearVenta = async (req, res) => {
  try {
    const venta = new Ventas(req.body);
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

// ⭐ CONTROLADOR: buscar venta por número de factura
export const buscarVentaPorNumero = async (req, res) => {
  try {
    const numero = Number(req.params.numeroFactura);
    const venta = await Venta.findOne({ factura: numero });
    if (!venta) {
      return res.json({ ok: false, mensaje: "Factura no encontrada" });
    }
    return res.json({ ok: true, venta });
  } catch (error) {
    console.error("Backend dice: Error consultando factura:", error);
    return res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
};
