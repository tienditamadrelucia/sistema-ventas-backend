import mongoose from "mongoose";
const dbCajaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },  
  cajaChica: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  gastos: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  ventas: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  esperado: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  contado: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  diferencia: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    Bs: { type: Number, default: 0 }
  },  
  billetes: {
    D: { type: Object, default: {} },
    P: { type: Object, default: {} },
    Bs: { type: Object, default: {} }
  },  
  compensacion: {
    D: { type: Number, default: 0 },
    P: { type: Number, default: 0 }
  },
});
export default mongoose.model("Caja", dbCajaSchema);
