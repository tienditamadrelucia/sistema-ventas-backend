import mongoose from "mongoose";


const entradaSchema = new mongoose.Schema(
  {
    fecha: {type: Date, required: true},
    categoria: {type: String, required: true},
    productoId: {type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },
    codigo: {type: String, required: true},
    cantidad: {type: Number, required: true },
    observacion: {type: String, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("Entrada", entradaSchema);