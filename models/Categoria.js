import mongoose from "mongoose";

const CategoriaSchema = new mongoose.Schema({
  codigo: { type: String, required: true },
  descripcion: { type: String, required: true }
});

export default mongoose.model("Categoria", CategoriaSchema);
