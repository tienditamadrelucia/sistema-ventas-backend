import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true
  },
    contraseña: {
    type: String,
    required: true
  },
  rol: {
    type: String,
    enum: ["admin", "usuario"],
    default: "usuario"
  }
}, {
  timestamps: true
});

export default mongoose.model("Usuario", userSchema);