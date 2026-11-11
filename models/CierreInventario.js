import mongoose from "mongoose";

const { Schema } = mongoose;

const cantidad = {
  type: Number,
  required: true,
  min: 0,

  validate: {
    validator: Number.isFinite,
    message:
      "Las cantidades del cierre deben ser números válidos."
  }
};

const detalleSchema = new Schema(
  {
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
      required: true
    },

    unidad: {
      type: String,
      default: ""
    },

    stockInicial: { ...cantidad },
    entradas: { ...cantidad },
    salidas: { ...cantidad },
    ventasContado: { ...cantidad },
    ventasCredito: { ...cantidad },
    stockFinal: { ...cantidad },

    versionProductoAntes: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    _id: false
  }
);

const cierreSchema = new Schema(
  {
    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    anio: {
      type: Number,
      required: true,
      min: 2000,
      max: 9999,
      validate: Number.isSafeInteger
    },

    mes: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      validate: Number.isSafeInteger
    },

    fechaInicio: {
      type: Date,
      required: true
    },

    // Primer día del siguiente mes.
    fechaFin: {
      type: Date,
      required: true
    },

    // Fecha a la que corresponde el saldo inicial.
    fechaBaseStock: {
      type: Date,
      required: true
    },

    origenBase: {
      type: String,
      enum: [
        "CIERRE_ANTERIOR",
        "APERTURA_CONFIRMADA"
      ],
      required: true
    },

    cierreAnteriorId: {
      type: Schema.Types.ObjectId,
      ref: "CierreInventario",
      default: null
    },

    observacionBase: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    detalles: {
      type: [detalleSchema],
      required: true,

      validate: {
        validator: lista =>
          lista.length > 0 &&
          new Set(
            lista.map(fila =>
              String(fila.productoId)
            )
          ).size === lista.length,

        message:
          "El cierre debe contener productos sin repetir."
      }
    },

    cerradoPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    cerradoEl: {
      type: Date,
      default: Date.now,
      required: true
    },

    claveOperacion: {
      type: String,
      required: true
    },

    firmaOperacion: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true,
    collection: "cierresInventario",
    optimisticConcurrency: true
  }
);

// Una sola aplicación por mes y sede.
cierreSchema.index(
  {
    sede: 1,
    anio: 1,
    mes: 1
  },
  {
    unique: true
  }
);

cierreSchema.index(
  {
    cerradoPor: 1,
    claveOperacion: 1
  },
  {
    unique: true
  }
);

cierreSchema.pre("validate", function () {
  const inicio = new Date(
    Date.UTC(this.anio, this.mes - 1, 1)
  );

  const fin = new Date(
    Date.UTC(this.anio, this.mes, 1)
  );

  if (
    this.fechaInicio?.getTime() !==
      inicio.getTime() ||
    this.fechaFin?.getTime() !==
      fin.getTime() ||
    this.fechaBaseStock?.getTime() !==
      inicio.getTime()
  ) {
    throw new Error(
      "El período y la fecha base del stock no coinciden."
    );
  }

  if (
    this.origenBase === "CIERRE_ANTERIOR" &&
    !this.cierreAnteriorId
  ) {
    throw new Error(
      "Debe indicar el cierre anterior que respalda la apertura."
    );
  }

  if (
    this.origenBase === "APERTURA_CONFIRMADA" &&
    (
      !this.observacionBase ||
      this.cierreAnteriorId
    )
  ) {
    throw new Error(
      "La apertura inicial requiere una explicación " +
      "y no puede señalar otro cierre."
    );
  }

  for (const fila of this.detalles || []) {
    const calculado =
      fila.stockInicial +
      fila.entradas -
      fila.salidas -
      fila.ventasContado -
      fila.ventasCredito;

    if (
      !Number.isFinite(calculado) ||
      Math.abs(
        calculado - fila.stockFinal
      ) > 0.000001
    ) {
      throw new Error(
        `El saldo final del producto ${fila.codigo} ` +
        "no coincide con sus movimientos."
      );
    }
  }
});

export default mongoose.model(
  "CierreInventario",
  cierreSchema
);