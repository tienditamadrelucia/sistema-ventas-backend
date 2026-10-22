import mongoose from "mongoose";

const detalleCompraSchema = new mongoose.Schema(
  {
    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    codigo: {
      type: Number,
      required: true
    },

    descripcion: {
      type: String,
      required: true
    },

    actividadProductiva: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActividadProductiva",
      default: null
    },

    cantidad: {
      type: Number,
      required: true,
      min: 0
    },

    // Precio por unidad en la moneda del gasto.
    costoUnitarioMoneda: {
      type: Number,
      required: true,
      min: 0
    },

    subtotalMoneda: {
      type: Number,
      required: true,
      min: 0
    },

    // Equivalente en dólares al registrar la compra.
    costoUnitarioUSD: {
      type: Number,
      required: true,
      min: 0
    },

    subtotalUSD: {
      type: Number,
      required: true,
      min: 0
    },

    entradaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entrada",
      required: true
    }
  },
  {
    _id: false
  }
);

const compraReventaSchema = new mongoose.Schema(
  {
    // Identifica la operación para evitar duplicarla
    // si se vuelve a enviar la misma solicitud.
    claveOperacion: {
      type: String,
      required: true
    },

    // Unidades de la moneda del gasto por cada dólar.
    // Si la compra es en dólares, la tasa es 1.
    tasaCambio: {
      type: Number,
      required: true,
      min: 0
    },

    totalUSD: {
      type: Number,
      required: true,
      min: 0
    },

    detalles: {
      type: [detalleCompraSchema],
      required: true,
      validate: {
        validator: (detalles) => detalles.length > 0,
        message: "La compra debe incluir productos."
      }
    }
  },
  {
    _id: false
  }
);

const dbGastosSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true
  },

  sede: {
    type: String,
    enum: ["TIENDITA", "MONASTERIO"],
    default: "TIENDITA"
  },

  descripcion: {
    type: String,
    required: true
  },

  clasificacion: {
    type: String,
    enum: [
      "SIN_CLASIFICAR",
      "GASTO_OPERATIVO",
      "COSTO_PRODUCCION",
      "SUELDOS_PERSONAL",
      "TRANSFERENCIA_PARTICIPACION",
      "COMPRA_REVENTA"
    ],
    default: "SIN_CLASIFICAR"
  },

  actividadProductiva: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActividadProductiva",
    default: null
  },

  moneda: {
    type: String,
    required: true
  },

  monto: {
    type: Number,
    required: true
  },

  numeroRecibo: {
    type: String,
    default: ""
  },

  cajaChica: {
    type: Boolean,
    default: false
  },

  usuario: {
    type: String
  },

  creado: {
    type: Date,
    default: Date.now
  },

  cierre: {
    type: String,
    default: "N"
  },

  // Solo se completa en las nuevas compras para reventa.
  compraReventa: {
    type: compraReventaSchema,
    default: undefined
  }
});

export default mongoose.model("Gastos", dbGastosSchema);