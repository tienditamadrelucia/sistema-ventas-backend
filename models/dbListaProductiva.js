import mongoose from "mongoose";

const ActividadProductivaSchema = new mongoose.Schema(
  {
    descripcion: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true
    },

    activa: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  "ActividadProductiva",
  ActividadProductivaSchema
);