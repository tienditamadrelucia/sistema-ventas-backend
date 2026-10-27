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

const asignacionLoteSchema = new mongoose.Schema(
  {
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      required: true
    },

    sedeProduccion: {
      type: String,
      enum: ["MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    concepto: {
      type: String,
      enum: [
        "COMPRA_POLLITOS",
        "ALIMENTO",
        "MEDICAMENTOS_VACUNAS",
        "CAMA_LIMPIEZA",
        "ATENCION_VETERINARIA",
        "PROCESAMIENTO",
        "EMPAQUE",
        "TRANSPORTE",
        "OTROS"
      ],
      required: true
    },

    // Parte del gasto asignada al lote.
    // Usa la misma moneda del gasto original.
    montoAsignado: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator: (valor) =>
          Number.isFinite(valor) &&
          Number.isSafeInteger(
            Math.round(valor * 100)
          ) &&
          Math.abs(
            valor * 100 -
            Math.round(valor * 100)
          ) < 0.000001,
        message:
          "El monto asignado debe tener como máximo dos decimales."
      }
    },

    asignadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    fechaAsignacion: {
      type: Date,
      default: Date.now,
      required: true
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

  // Distribución del gasto entre lotes de producción.
// No crea pagos adicionales ni cambia la sede que paga.
asignacionesLotes: {
  type: [asignacionLoteSchema],
  default: undefined,
  validate: {
    validator: function (asignaciones) {
      if (!asignaciones || asignaciones.length === 0) {
        return true;
      }

      const lotes = asignaciones.map(
        (asignacion) => String(asignacion.loteId)
      );

      if (new Set(lotes).size !== lotes.length) {
        return false;
      }

      const totalCentavos = asignaciones.reduce(
        (suma, asignacion) =>
          suma +
          Math.round(asignacion.montoAsignado * 100),
        0
      );

      const montoCentavos = Math.round(
        Number(this.monto) * 100
      );

      return (
        Number.isSafeInteger(totalCentavos) &&
        Number.isSafeInteger(montoCentavos) &&
        totalCentavos <= montoCentavos
      );
    },
    message:
      "No puede repetir un lote ni asignar más que el monto total del gasto."
  }
},

  // Solo se completa en las nuevas compras para reventa.
  compraReventa: {
    type: compraReventaSchema,
    default: undefined
  }
});

export default mongoose.model("Gastos", dbGastosSchema);