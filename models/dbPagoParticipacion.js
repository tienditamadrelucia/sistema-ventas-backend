import mongoose from "mongoose";

const PagoParticipacionSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true
    },

    // Sede que entrega el dinero
    sedePaga: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    // Sede que recibe el dinero
    sedeRecibe: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    monto: {
      type: Number,
      required: true,
      min: 0.01
    },

    observacion: {
      type: String,
      default: "",
      trim: true
    },

    usuario: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

// Una sede nunca puede pagarse a sí misma
PagoParticipacionSchema.pre("validate", function (next) {
  if (this.sedePaga === this.sedeRecibe) {
    return next(
      new Error(
        "La sede que paga y la sede que recibe no pueden ser la misma."
      )
    );
  }

  next();
});

export default mongoose.model(
  "PagoParticipacion",
  PagoParticipacionSchema
);