import Vendido from "../models/dbVendidos.js";

export const crearVendido = async (req, res) => {
  try {
    const vendido = new Vendido(req.body);
    await vendido.save();

    res.json({ ok: true });

  } catch (error) {
    console.error("Error guardando producto vendido:", error);
    res.status(500).json({ ok: false, error: "Error al guardar producto vendido" });
  }
};

export const obtenerVendidosPorVenta = async (req, res) => {
  try {
    const { factura } = req.params;
    const vendidos = await Vendido.find({ factura });
    res.json(vendidos);
  } catch (error) {
    res.status(500).json({ error: "Backend dice: Error al obtener vendidos" });
  }
};
