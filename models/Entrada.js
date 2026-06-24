import mongoose from "mongoose";

const entradaSchema = new mongoose.Schema(
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
      // Motivo de la entrada: COMPRA, AJUSTE, etc.
      precioCompra: { type: Number },
      precioVenta: { type: Number },
      observacion: { type: String, required: true },
      cierre: { type: String, default: "N" }
    },
    { timestamps: true }
  );
export default mongoose.model("Entrada", entradaSchema);
