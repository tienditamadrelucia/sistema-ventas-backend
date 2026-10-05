import mongoose from "mongoose";

const IngresoSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },

  sede: {
    type: String,
    enum: ["MONASTERIO"],
    default: "MONASTERIO",
    required: true
  },

  numeroReciboIngreso: {
    type: String,
    required: true,
    trim: true
  },

  tipoIngreso: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TipoIngreso",
    required: true
  },

  descripcion: {
    type: String,
    default: "",
    trim: true
  },

  monto: {
    type: Number,
    required: true,
    min: 0
  },

  origen: {
    type: String,
    enum: ["MANUAL", "PARTICIPACION"],
    default: "MANUAL"
  },

  pagoParticipacion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PagoParticipacion",
    default: null
  },

  usuario: {
    type: String,
    default: ""
  },

  cierre: {
    type: String,
    enum: ["N", "S"],
    default: "N"
  }
}, { timestamps: true });

export default mongoose.model("Ingreso", IngresoSchema);