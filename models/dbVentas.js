import mongoose from "mongoose";

const VentaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  hora: { type: String, required: true },
  factura: { type: Number, required: true, unique: true },
  cliente: { type: String, required: true },
  subtotal: { type: Number, required: true },
  IVA: { type: Number, default: 0 },
  total: { type: Number, required: true },
  usuario: { type: String, required: true },
  estado: { type: String, enum: ["CONTADO", "CREDITO"], required: true }
}, { timestamps: true });

export default mongoose.model("ventas", VentaSchema);
