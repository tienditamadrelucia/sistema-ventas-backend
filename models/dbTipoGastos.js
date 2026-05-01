import mongoose from "mongoose";

const TipoGastoSchema = new mongoose.Schema({  
  descripcion: { type: String, required: true, unique: true }
});

export default mongoose.model("TipoGastos", TipoGastoSchema);