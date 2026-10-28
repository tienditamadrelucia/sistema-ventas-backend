import mongoose from "mongoose";

const salidaSchema = new mongoose.Schema(
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

    // PRODUCCIÓN, CONSUMO Y ENVÍOS DE POLLOS
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      default: null
    },

    consumoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConsumoLote",
      default: null
    },

    envioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnvioLote",
      default: null
    },

    presentacionProduccion: {
      type: String,
      enum: ["PIEZA", "PAQUETE_DOS", "SOLO_PESO"],
      default: undefined
    },

    cantidadPresentaciones: {
      type: Number,
      default: null
    },

    // CONSUMO, PÉRDIDAS Y ENVÍOS DE HUEVOS
    grupoGallinasId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GrupoGallinas",
      default: undefined
    },

    movimientoHuevosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MovimientoHuevos",
      default: undefined
    },

    huevosUnidades: {
      type: Number,
      min: 1,
      default: undefined,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "La cantidad de huevos debe ser un número entero."
      }
    }
  },
  {
    timestamps: true
  }
);

// COMPROBAR LAS SALIDAS VINCULADAS A HUEVOS
salidaSchema.pre("validate", function () {
  const esSalidaHuevos =
    this.movimientoHuevosId ||
    this.grupoGallinasId ||
    this.huevosUnidades !== undefined;

  if (!esSalidaHuevos) return;

  if (
    !this.movimientoHuevosId ||
    !this.grupoGallinasId ||
    !Number.isSafeInteger(this.huevosUnidades) ||
    this.huevosUnidades < 1 ||
    Math.abs(
      this.cantidad * 30 - this.huevosUnidades
    ) > 0.00001 ||
    this.loteId ||
    this.consumoId ||
    this.envioId
  ) {
    throw new Error(
      "La salida de huevos no coincide con su " +
      "registro de consumo o envío."
    );
  }
});

salidaSchema.index({
  loteId: 1,
  sede: 1,
  fecha: 1
});

salidaSchema.index({
  consumoId: 1
});

salidaSchema.index({
  grupoGallinasId: 1,
  sede: 1,
  fecha: 1
});

salidaSchema.index({
  movimientoHuevosId: 1
});

export default mongoose.model(
  "dbSalidas",
  salidaSchema
);