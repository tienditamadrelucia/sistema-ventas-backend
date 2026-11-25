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

    // COMPRA PARA REVENTA
    gastoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gastos",
      default: undefined
    },

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

    tasaCambioCompra: {
      type: Number,
      min: 0,
      default: undefined
    },

    // PRODUCCIÓN Y ENVÍOS DE POLLOS
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      default: null
    },

    produccionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProduccionPollo",
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

    // PRODUCCIÓN Y RECEPCIÓN DE HUEVOS
    conciliacionHuevosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConciliacionHuevos",
      default: undefined
    },
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

// COMPROBAR LAS ENTRADAS VINCULADAS A HUEVOS
entradaSchema.pre("validate", function () {
  const esEntradaHuevos =
    this.conciliacionHuevosId ||
    this.movimientoHuevosId ||
    this.grupoGallinasId ||
    this.huevosUnidades !== undefined;

  if (!esEntradaHuevos) return;

  const cantidadValida =
    Number.isFinite(this.cantidad) &&
    Number.isSafeInteger(this.huevosUnidades) &&
    this.huevosUnidades > 0 &&
    Math.abs(this.cantidad * 30 - this.huevosUnidades) <= 0.00001;

  const vinculacionAjena =
    this.loteId || this.produccionId || this.envioId || this.gastoId;

  if (this.conciliacionHuevosId) {
    if (!cantidadValida || vinculacionAjena ||
        this.movimientoHuevosId || this.grupoGallinasId) {
      throw new Error("Entrada de conciliación de huevos inconsistente.");
    }
    return;
  }

  if (!cantidadValida || vinculacionAjena ||
      !this.movimientoHuevosId || !this.grupoGallinasId) {
    throw new Error(
      "La entrada de huevos no coincide con su registro de producción o recepción."
    );
  }
});

entradaSchema.index({
  grupoGallinasId: 1,
  sede: 1,
  fecha: 1
});

entradaSchema.index({
  movimientoHuevosId: 1
});

entradaSchema.index(
  { conciliacionHuevosId: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model(
  "Entrada",
  entradaSchema
);