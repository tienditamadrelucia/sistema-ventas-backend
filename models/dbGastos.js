import mongoose from "mongoose";

const dbGastosSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  descripcion: { type: String, required: true },
  moneda: { type: String, required: true }, // "D", "P", "Bs"
  monto: { type: Number, required: true },
  numeroRecibo: { type: String, default: "" }, 
  cajaChica: { type: Boolean, default: false },
  usuario: { type: String },
  creado: { type: Date, default: Date.now }
});

export default mongoose.model("Gastos", dbGastosSchema);
