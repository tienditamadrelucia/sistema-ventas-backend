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
  foto: String,

  // -----------------------------------------
  // ORIGEN DEL PRODUCTO
  // -----------------------------------------

  origen: {
    type: String,
    enum: ["COMPRADO", "PRODUCCION_MONASTERIO"],
    default: "COMPRADO"
  },

  // -----------------------------------------
  // LIQUIDACIÓN AL MONASTERIO
  // Solo aplica a PRODUCCION_MONASTERIO
  // -----------------------------------------

  tipoLiquidacion: {
    type: String,
    enum: ["NINGUNA", "PORCENTAJE", "MONTO_FIJO"],
    default: "NINGUNA"
  },

  valorLiquidacion: {
    type: Number,
    default: 0
  },

  liquidarAlMonasterio: {
    type: Boolean,
    default: false
  }
});

export default mongoose.model("Producto", ProductoSchema);