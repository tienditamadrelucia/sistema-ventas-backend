import mongoose from "mongoose";

const entradaSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true
    },

    categoria: {
      type: String
    },

    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    codigo: {
      type: Number
    },

    cantidad: {
      type: Number,
      required: true
    },

    precioCompra: {
      type: Number
    },

    precioVenta: {
      type: Number
    },

    observacion: {
      type: String,
      required: true
    },

    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      default: "TIENDITA",
      required: true
    },

    cierre: {
      type: String,
      default: "N"
    },

    // Gasto que generó esta entrada.
    // Las entradas anteriores no necesitan este campo.
    gastoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gastos",
      default: undefined
    },

    // Datos de la compra en su moneda original.
    monedaCompra: {
      type: String,
      enum: ["D", "P", "Bs"],
      default: undefined
    },

    costoUnitarioMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    // Unidades de la moneda original por cada dólar.
    tasaCambioCompra: {
      type: Number,
      min: 0,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Entrada", entradaSchema);