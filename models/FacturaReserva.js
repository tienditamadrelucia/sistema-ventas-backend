import mongoose from "mongoose";

const FacturaReservaSchema = new mongoose.Schema({
  numero: { type: Number, required: true, unique: true },
  estado: { type: String, enum: ["RESERVADA", "FINALIZADA"], default: "RESERVADA" },
  pagoAsociado: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("FacturaReserva", FacturaReservaSchema);
