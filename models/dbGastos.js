import mongoose from "mongoose";

const cargoCompraSchema = new mongoose.Schema(
  {
    concepto: {
      type: String,
      required: true,
      trim: true
    },

    tipo: {
      type: String,
      enum: ["PORCENTAJE", "MONTO"],
      required: true
    },

    valor: {
      type: Number,
      required: true,
      min: 0
    },

    // SUBTOTAL: solo los productos.
    // TOTAL_ACUMULADO: productos y cargos anteriores.
    baseCalculo: {
      type: String,
      enum: ["SUBTOTAL", "TOTAL_ACUMULADO"],
      default: "SUBTOTAL"
    },

    incorporaCosto: {
      type: Boolean,
      default: true
    },

    // Importe calculado por el servidor
    // en la moneda original de la compra.
    montoMoneda: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    _id: false
  }
);

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

        // Importe del producto antes de impuestos y recargos.
    subtotalBaseMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    // Parte de los cargos que aumenta el costo del producto.
    cargosCostoMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    // Parte pagada que no se incorpora al costo.
    cargosNoCostoMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    // Base más los cargos incorporados al costo.
    costoTotalMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    costoTotalUSD: {
      type: Number,
      min: 0,
      default: undefined
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

        subtotalProductosMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    totalCargosMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    cargosCostoMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    cargosNoCostoMoneda: {
      type: Number,
      min: 0,
      default: undefined
    },

    totalCostoUSD: {
      type: Number,
      min: 0,
      default: undefined
    },

    cargos: {
      type: [cargoCompraSchema],
      default: undefined
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