import mongoose from "mongoose";

const TasasSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  cajachicaP: { type: Number, required: true },
  cajachicaD: { type: Number, required: true },
  tasaP: { type: Number, required: true },
  tasaD: { type: Number, required: true }
}, { timestamps: true });

export default mongoose.model("dbTasas", TasasSchema);
