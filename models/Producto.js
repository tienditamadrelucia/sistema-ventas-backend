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
  // PARTICIPACIÓN ENTRE SEDES
  //
  // Ejemplos:
  //
  // TIENDITA vende pollo:
  // beneficiarioParticipacion = MONASTERIO
  //
  // MONASTERIO vende pollo:
  // beneficiarioParticipacion = TIENDITA
  //
  // La participación se genera AL VENDER,
  // no cuando el producto ingresa al inventario.
  // -----------------------------------------

  generaParticipacion: {
    type: Boolean,
    default: false
  },

  beneficiarioParticipacion: {
    type: String,
    enum: ["TIENDITA", "MONASTERIO", "NINGUNO"],
    default: "NINGUNO"
  },

  tipoParticipacion: {
    type: String,
    enum: ["NINGUNA", "PORCENTAJE", "MONTO_FIJO"],
    default: "NINGUNA"
  },

  valorParticipacion: {
    type: Number,
    default: 0
  }
});

export default mongoose.model("Producto", ProductoSchema);