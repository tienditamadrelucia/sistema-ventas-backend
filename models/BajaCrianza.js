import mongoose from "mongoose";

const BajaCrianzaSchema = new mongoose.Schema(
  {
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      required: true
    },

    sede: {
      type: String,
      enum: ["MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    fecha: {
      type: Date,
      required: true
    },

    cantidad: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "La cantidad de animales debe ser un entero mayor que cero."
      }
    },

    motivo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    // Identifica una solicitud para impedir
    // que un reintento registre la misma baja dos veces.
    claveOperacion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    }
  },
  {
    timestamps: true
  }
);

BajaCrianzaSchema.index(
  {
    loteId: 1,
    claveOperacion: 1
  },
  {
    unique: true
  }
);

BajaCrianzaSchema.index({
  loteId: 1,
  fecha: 1
});

export default mongoose.model(
  "BajaCrianza",
  BajaCrianzaSchema
);