// models/dbSalidas.js
import mongoose from "mongoose";

const salidaSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },

    // Código de la categoría (ALB, VEL, etc.)
    categoria: { type: String },

    // ID del producto
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },

    // Código del producto (opcional, porque ya tenemos el ID)
    codigo: { type: Number },

    // Cantidad que sale
    cantidad: { type: Number, required: true },

    // Motivo de la salida: VENTA, AJUSTE, etc.
    observacion: { type: String, required: true }
  },
  { timestamps: true }
);


export default mongoose.model("dbSalidas", salidaSchema);