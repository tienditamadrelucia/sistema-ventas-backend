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

    // En los productos de pollo, la cantidad es en kilos.
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

    // Vinculación con el lote de producción.
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      default: null
    },

    // Registro de consumo que generó esta salida.
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
    }
  },
  {
    timestamps: true
  }
);

salidaSchema.index({
  loteId: 1,
  sede: 1,
  fecha: 1
});

salidaSchema.index({
  consumoId: 1
});

export default mongoose.model(
  "dbSalidas",
  salidaSchema
);