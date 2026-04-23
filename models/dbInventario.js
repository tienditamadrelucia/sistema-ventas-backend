import mongoose from "mongoose";

const InventarioSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },          // Fecha de la toma de inventario
  categoria: { type: String, required: true},             // categoria
  productoId: { type: String, required: true },   // Código o ID del producto
  stockSistema: { type: Number, required: true }, // Stock final del sistema en esa fecha
  stockFisico: { type: Number, required: true },  // Toma física realizada
  observacion: { type: String, default: "" }      // Nota opcional
}, { timestamps: true });

export default mongoose.model("Inventario", InventarioSchema);