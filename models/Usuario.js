import mongoose from "mongoose";

const UsuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true },
  clave: { type: String, required: true },
  nombre: String,
  rol: String
});

export default mongoose.model("Usuario", UsuarioSchema);