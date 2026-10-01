import mongoose from "mongoose";

const ProductoSchema = new mongoose.Schema({
  codigo: { type: Number, required: true },

  sede: {
    type: String,
    enum: ["TIENDITA", "MONASTERIO"],
    default: "TIENDITA",
    required: true
  },

  descripcion: String,
  categoria: String,
  medida: String,
  stock: Number,
  fechaIngreso: Date,
  costo: Number,
  venta: Number,
  precioanterior: Number,
  foto: String
});

export default mongoose.model("Producto", ProductoSchema);