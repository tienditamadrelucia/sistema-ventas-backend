import mongoose from "mongoose";

const ContadorSchema = new mongoose.Schema({
  tipo: { type: String, required: true, unique: true }, // "FACTURA"
  valor: { type: Number, required: true, default: 0 }
}, { timestamps: true });

export default mongoose.model("Contador", ContadorSchema);
