import Contador from "../models/Contador.js";

export async function obtenerFactura() {
  const doc = await Contador.findOneAndUpdate(
    { tipo: "FACTURA" },
    { $inc: { valor: 1 } },
    { new: true, upsert: true }
  );
  return doc.valor;
}
