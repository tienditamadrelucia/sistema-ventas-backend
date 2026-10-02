import mongoose from "mongoose";

const UsuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true },
  clave: { type: String, required: true },
  nombre: String,
  rol: String,
  accesoTiendita: { type: Boolean, default: true },
  accesoMonasterio: { type: Boolean, default: false }
});

export default mongoose.model("Usuario", UsuarioSchema);