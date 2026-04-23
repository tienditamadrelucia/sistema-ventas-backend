import mongoose from "mongoose";

const LogSchema = new mongoose.Schema({
  usuario: { type: String, required: true },
  accion: { type: String, required: true },
  fecha: { type: Date, default: Date.now }
});

export default mongoose.model("Log", LogSchema);