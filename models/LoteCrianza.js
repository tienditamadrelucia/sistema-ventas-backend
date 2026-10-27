import mongoose from "mongoose";

const LoteCrianzaSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    sede: {
      type: String,
      enum: ["MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    especie: {
      type: String,
      enum: ["POLLOS"],
      default: "POLLOS",
      required: true
    },

    fechaInicio: {
      type: Date,
      required: true
    },

    cantidadInicial: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "La cantidad de pollitos debe ser un número entero."
      }
    },

    proveedor: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200
    },

    observaciones: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },

    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    }
  },
  {
    timestamps: true
  }
);

LoteCrianzaSchema.index({
  sede: 1,
  fechaInicio: -1
});

export default mongoose.model(
  "LoteCrianza",
  LoteCrianzaSchema
);