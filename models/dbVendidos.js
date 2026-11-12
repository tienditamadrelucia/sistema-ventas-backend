import mongoose from "mongoose";

const asignacionSchema = new mongoose.Schema(
  {
    grupoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GrupoGallinas",
      default: null
    },

    unidades: {
      type: Number,
      min: 1,
      required: true,
      validate: Number.isSafeInteger
    }
  },
  {
    _id: false
  }
);

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

    // Los encargos sin entrega no descuentan inventario.
    // El controlador establecerá false para los créditos.
    descuentaInventario: {
      type: Boolean,
      default: true
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

    origenProducto: {
      type: String,
      enum: ["COMPRADO", "PRODUCCION_MONASTERIO"],
      default: undefined
    },

    costoUnitarioUSD: {
      type: Number,
      min: 0,
      default: undefined
    },

    actividadProductiva: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActividadProductiva",
      default: null
    },

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
    },

    montoParticipacion: {
      type: Number,
      default: 0
    },

    huevosUnidades: {
      type: Number,
      min: 1,
      default: undefined,
      validate: Number.isSafeInteger
    },

    fechaVentaHuevos: {
      type: Date,
      default: undefined
    },

    asignacionesHuevos: {
      type: [asignacionSchema],
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

VendidoSchema.pre("validate", function () {
  const tieneControlHuevos =
    this.huevosUnidades !== undefined ||
    this.fechaVentaHuevos ||
    this.asignacionesHuevos?.length;

  if (!tieneControlHuevos) return;

  const asignaciones = this.asignacionesHuevos || [];

  const grupos = asignaciones.map(
    item => String(item.grupoId || "SIN_GRUPO")
  );

  const totalAsignado = asignaciones.reduce(
    (suma, item) => suma + item.unidades,
    0
  );

  if (
    !this.fechaVentaHuevos ||
    !Number.isSafeInteger(this.huevosUnidades) ||
    this.huevosUnidades < 1 ||
    !Number.isSafeInteger(this.cantidad * 2) ||
    Math.abs(
      this.cantidad * 30 - this.huevosUnidades
    ) > 0.00001 ||
    !asignaciones.length ||
    totalAsignado !== this.huevosUnidades ||
    new Set(grupos).size !== grupos.length
  ) {
    throw new Error(
      "Las presentaciones de huevos no coinciden " +
      "con la cantidad ni con los grupos asignados."
    );
  }
});

VendidoSchema.index({
  "asignacionesHuevos.grupoId": 1,
  fechaVentaHuevos: 1,
  sede: 1
});

export default mongoose.model(
  "vendidos",
  VendidoSchema
);