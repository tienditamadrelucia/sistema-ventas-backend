import mongoose from "mongoose";

const VendidoSchema = new mongoose.Schema({
  factura: { type: Number, required: true },  
  productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },
  cantidad: { type: Number, required: true },
  precio: { type: Number, required: true },
  dscto: { type: Number, default: 0 },
  total: { type: Number, required: true }
}, { timestamps: true });

export default mongoose.model("vendidos", VendidoSchema);
