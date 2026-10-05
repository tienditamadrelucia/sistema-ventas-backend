import mongoose from "mongoose";

const TipoIngresoSchema = new mongoose.Schema({
  descripcion: {
    type: String,
    required: true,
    unique: true,
    trim: true
  }
});

export default mongoose.model("TipoIngreso", TipoIngresoSchema);