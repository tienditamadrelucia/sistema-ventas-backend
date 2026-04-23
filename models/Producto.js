import mongoose from "mongoose";

const ProductoSchema = new mongoose.Schema({
  codigo: Number,
  descripcion: String,
  categoria: String,
  medida: String,
  stock: Number,
  fechaIngreso: Date,
  costo: Number,
  venta: Number,
  foto: String
});

export default mongoose.model("Producto", ProductoSchema);