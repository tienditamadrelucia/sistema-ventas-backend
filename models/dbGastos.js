import mongoose from "mongoose";

// IMPUESTOS Y RECARGOS DE LAS COMPRAS
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

    baseCalculo: {
      type: String,
      enum: ["SUBTOTAL", "TOTAL_ACUMULADO"],
      default: "SUBTOTAL"
    },

    incorporaCosto: {
      type: Boolean,
      default: true
    },

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

// PRODUCTOS INCLUIDOS EN UNA COMPRA PARA REVENTA
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

    subtotalBaseMoneda: {
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
// COMPRA COMPLETA PARA REVENTA
const compraReventaSchema = new mongoose.Schema(
  {
    claveOperacion: {
      type: String,
      required: true
    },

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
        validator: (detalles) =>
          detalles.length > 0,
        message:
          "La compra debe incluir productos."
      }
    }
  },
  {
    _id: false
  }
);

// ASIGNACIÓN DE GASTOS A LOTES DE POLLOS
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

// ASIGNACIÓN DE GASTOS A GRUPOS DE GALLINAS
const asignacionGallinasSchema = new mongoose.Schema(
  {
    grupoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GrupoGallinas",
      required: true
    },

    concepto: {
      type: String,
      required: true,
      enum: [
        "COMPRA_GALLINAS",
        "ALIMENTO",
        "MEDICAMENTOS_VACUNAS",
        "CAMA_LIMPIEZA",
        "ATENCION_VETERINARIA",
        "EMPAQUE",
        "TRANSPORTE",
        "OTROS"
      ]
    },

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
          "Use un importe positivo con hasta dos decimales."
      }
    },

    asignadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    fechaAsignacion: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    _id: false
  }
);
// MODELO PRINCIPAL DE GASTOS
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

  // ASIGNACIONES A LOTES DE POLLOS
  asignacionesLotes: {
    type: [asignacionLoteSchema],
    default: undefined,

    validate: {
      validator: function (asignaciones) {
        if (!asignaciones || asignaciones.length === 0) {
          return true;
        }

        const lotes = asignaciones.map(
          (asignacion) =>
            String(asignacion.loteId)
        );

        if (new Set(lotes).size !== lotes.length) {
          return false;
        }

        const totalCentavos = asignaciones.reduce(
          (suma, asignacion) =>
            suma +
            Math.round(
              asignacion.montoAsignado * 100
            ),
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
        "No puede repetir un lote ni asignar " +
        "más que el monto total del gasto."
    }
  },

  // ASIGNACIONES A GRUPOS DE GALLINAS
  asignacionesGallinas: {
    type: [asignacionGallinasSchema],
    default: undefined
  },

  // COMPRAS PARA REVENTA
  compraReventa: {
    type: compraReventaSchema,
    default: undefined
  }
});

// DETECTAR CAMBIOS CONCURRENTES AL GUARDAR
dbGastosSchema.set(
  "optimisticConcurrency",
  true
);

// VALIDAR TODAS LAS ASIGNACIONES DEL GASTO
dbGastosSchema.pre("validate", function () {
  const gallinas = this.asignacionesGallinas || [];

  const grupos = gallinas.map(
    (asignacion) =>
      String(asignacion.grupoId)
  );

  if (new Set(grupos).size !== grupos.length) {
    throw new Error(
      "No puede repetir un grupo en el mismo gasto."
    );
  }

  const asignaciones = [
    ...(this.asignacionesLotes || []),
    ...gallinas
  ];

  const totalCentavos = asignaciones.reduce(
    (suma, asignacion) =>
      suma +
      Math.round(
        asignacion.montoAsignado * 100
      ),
    0
  );

  const montoCentavos = Math.round(
    Number(this.monto) * 100
  );

  if (
    !Number.isSafeInteger(totalCentavos) ||
    (
      asignaciones.length > 0 &&
      totalCentavos > montoCentavos
    )
  ) {
    throw new Error(
      "Las asignaciones a pollos y gallinas " +
      "no pueden superar juntas el importe del gasto."
    );
  }
});

export default mongoose.model(
  "Gastos",
  dbGastosSchema
);