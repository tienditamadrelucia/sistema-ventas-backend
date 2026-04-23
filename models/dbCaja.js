import mongoose from "mongoose";

const dbCajaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },

  // Caja chica inicial
  cajaChica: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Gastos del día
  gastos: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Ventas del día
  ventas: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Total esperado en caja
  esperado: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Total contado por billetes
  contado: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Diferencia
  diferencia: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },

  // Desglose de billetes
  billetes: {
    D: { type: Object, default: {} },
    P: { type: Object, default: {} },
    Bs: { type: Object, default: {} }
  },

  // Compensación
  compensacion: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 }
  },
});

export default mongoose.model("Caja", dbCajaSchema);
