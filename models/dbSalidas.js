// models/dbSalidas.js
import mongoose from "mongoose";

const salidaSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },
    categoria: { type: String, required: true },      // descripción de la categoría
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },
    codigo: { type: String, required: true },
    cantidad: { type: Number, required: true },
    observacion: { type: String, required: true }     // VENTA, AJUSTE, etc.
  },
  { timestamps: true }
);

export default mongoose.model("dbSalidas", salidaSchema);