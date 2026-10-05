import mongoose from "mongoose";

const dbGastosSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true
  },

  sede: {
    type: String,
    enum: ["TIENDITA", "MONASTERIO"],
    default: "TIENDITA"
  },

  descripcion: {
    type: String,
    required: true
  },

  // ⭐ CLASIFICACIÓN ECONÓMICA DEL GASTO
  clasificacion: {
    type: String,
    enum: [
      "SIN_CLASIFICAR",
      "GASTO_OPERATIVO",
      "COSTO_PRODUCCION",
      "SUELDOS_PERSONAL"
    ],
    default: "SIN_CLASIFICAR"
  },

  // ⭐ ACTIVIDAD A LA QUE PERTENECE EL COSTO
  actividadProductiva: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ActividadProductiva",
    default: null
  },

  moneda: {
    type: String,
    required: true
  }, // "D", "P", "Bs"

  monto: {
    type: Number,
    required: true
  },

  numeroRecibo: {
    type: String,
    default: ""
  },

  cajaChica: {
    type: Boolean,
    default: false
  },

  usuario: {
    type: String
  },

  creado: {
    type: Date,
    default: Date.now
  },

  cierre: {
    type: String,
    default: "N"
  }
});

export default mongoose.model("Gastos", dbGastosSchema);
