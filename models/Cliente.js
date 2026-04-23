import mongoose from "mongoose";

const ClienteSchema = new mongoose.Schema({
  identificacion: {
    type: String,
    required: true,
    unique: true,
    trim: true
    },
  nombreCompleto: { type: String, required: true },
  direccion: { type: String, default: "" },
  telefono: { type: String, default: "" },
  fechaIngreso: { type: Date, required: true }
});

export default mongoose.model("Cliente", ClienteSchema);