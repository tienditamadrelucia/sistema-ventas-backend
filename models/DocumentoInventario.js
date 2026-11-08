import mongoose from "mongoose";

const { Schema } = mongoose;

const detalleSchema = new Schema({
  productoId: {
    type: Schema.Types.ObjectId,
    ref: "Producto",
    required: true
  },

  codigo: {
    type: Number,
    required: true
  },

  descripcion: {
    type: String,
    required: true,
    trim: true
  },

  categoria: {
    type: String,
    default: ""
  },

  unidad: {
    type: String,
    default: ""
  },

  cantidad: {
    type: Number,
    required: true,
    validate: {
      validator: valor =>
        Number.isFinite(valor) && valor > 0,
      message: "La cantidad debe ser mayor que cero."
    }
  },

  precioVenta: {
    type: Number,
    default: undefined,
    validate: {
      validator: valor =>
        valor === undefined ||
        (Number.isFinite(valor) && valor >= 0),
      message: "El precio de venta no es válido."
    }
  },

  entradaId: {
    type: Schema.Types.ObjectId,
    ref: "Entrada",
    default: null
  },

  salidaId: {
    type: Schema.Types.ObjectId,
    ref: "dbSalidas",
    default: null
  }
});

const revisionSchema = new Schema(
  {
    accion: {
      type: String,
      enum: ["VERIFICAR", "REABRIR"],
      required: true
    },

    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    fecha: {
      type: Date,
      default: Date.now
    },

    observacion: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    }
  },
  {
    _id: false
  }
);

const documentoSchema = new Schema(
  {
    tipo: {
      type: String,
      enum: ["ENTRADA", "SALIDA"],
      required: true
    },

    // La generará el servidor al guardar.
    referencia: {
      type: String,
      required: true,
      trim: true,
      immutable: true
    },

    fecha: {
      type: Date,
      required: true
    },

    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    motivo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    observaciones: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    detalles: {
      type: [detalleSchema],
      required: true,
      validate: {
        validator: detalles =>
          detalles.length > 0 &&
          detalles.length <= 200 &&
          new Set(
            detalles.map(detalle =>
              String(detalle.productoId)
            )
          ).size === detalles.length,

        message:
          "Incluya entre 1 y 200 artículos, sin repetir productos."
      }
    },

    estado: {
      type: String,
      enum: ["PENDIENTE", "VERIFICADO"],
      default: "PENDIENTE",
      required: true
    },

    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      immutable: true
    },

    verificadoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null
    },

    fechaVerificacion: {
      type: Date,
      default: null
    },

    historialRevision: {
      type: [revisionSchema],
      default: []
    },

    cierre: {
      type: String,
      enum: ["N", "S"],
      default: "N"
    },

    // Conserva la identidad del registro al reintentar.
    claveOperacion: {
      type: String,
      required: true,
      immutable: true
    },

    firmaOperacion: {
      type: String,
      required: true,
      immutable: true
    }
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    collection: "documentosInventario"
  }
);

documentoSchema.index(
  { referencia: 1 },
  { unique: true }
);

documentoSchema.index(
  { registradoPor: 1, claveOperacion: 1 },
  { unique: true }
);

documentoSchema.index({
  sede: 1,
  fecha: -1,
  _id: -1
});

documentoSchema.index({
  estado: 1,
  sede: 1,
  fecha: -1
});

documentoSchema.pre("validate", function () {
  if (
    this.estado === "VERIFICADO" &&
    (!this.verificadoPor || !this.fechaVerificacion)
  ) {
    throw new Error(
      "Debe quedar registrado quién verificó el documento y cuándo."
    );
  }

  if (
    this.estado === "PENDIENTE" &&
    (this.verificadoPor || this.fechaVerificacion)
  ) {
    throw new Error(
      "Un documento pendiente no puede conservar una verificación activa."
    );
  }

  for (const detalle of this.detalles || []) {
    if (
      (this.tipo === "ENTRADA" && detalle.salidaId) ||
      (this.tipo === "SALIDA" && detalle.entradaId)
    ) {
      throw new Error(
        "El movimiento vinculado no corresponde al tipo de documento."
      );
    }
  }
});

export default mongoose.model(
  "DocumentoInventario",
  documentoSchema
);