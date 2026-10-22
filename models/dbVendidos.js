import mongoose from "mongoose";

const VendidoSchema = new mongoose.Schema(
  {
    factura: {
      type: Number,
      required: true
    },

    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    cantidad: {
      type: Number,
      required: true
    },

    precio: {
      type: Number,
      required: true
    },

    dscto: {
      type: Number,
      default: 0
    },

    total: {
      type: Number,
      required: true
    },

    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      default: "TIENDITA",
      required: true
    },

    // ==========================================
    // ORIGEN Y COSTO AL MOMENTO DE LA VENTA
    // ==========================================

    origenProducto: {
      type: String,
      enum: ["COMPRADO", "PRODUCCION_MONASTERIO"],
      default: undefined
    },

    // Costo por unidad en dólares.
    // Ausente significa que el costo histórico no se conoce.
    costoUnitarioUSD: {
      type: Number,
      min: 0,
      default: undefined
    },

    // ==========================================
    // ACTIVIDAD PRODUCTIVA AL MOMENTO DE LA VENTA
    // ==========================================
    actividadProductiva: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActividadProductiva",
      default: null
    },

    // ==========================================
    // PARTICIPACIÓN AL MOMENTO DE LA VENTA
    // ==========================================
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

    // Porcentaje o monto fijo configurado
    // en el producto al momento de vender
    valorParticipacion: {
      type: Number,
      default: 0
    },

    // Importe REAL generado por este renglón vendido
    montoParticipacion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("vendidos", VendidoSchema);
