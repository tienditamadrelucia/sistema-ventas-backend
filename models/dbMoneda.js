import mongoose from "mongoose";

const MonedaSchema = new mongoose.Schema({
  fecha: { type: Date, required: true },
  operacion: { type: String, required: true }, // VENTA, ABONO, ANULACIÓN, etc.
  factura: { type: Number, required: true },
  total: { type: Number, required: true },

  // PAGOS EN PESOS
  efectivoP: { type: Number, default: 0 },
  transferenciaP: { type: Number, default: 0 },
  referenciaP: { type: String, default: "" },
  bancoP: { type: String, default: "" },

  // PAGOS EN BOLÍVARES
  efectivoBs: { type: Number, default: 0 },
  transferenciaBs: { type: Number, default: 0 },
  referenciaTBs: { type: String, default: "" },
  bancoTBs: { type: String, default: "" },
  puntoBs: { type: Number, default: 0 },
  refPunto: { type: String, default: "" },
  lotePunto: { type: String, default: "" },
  pagomovilBs: { type: Number, default: 0 },
  referenciaPMBs: { type: String, default: "" },
  bancoPMBs: { type: String, default: "" },

  // PAGOS EN DÓLARES
  efectivoD: { type: Number, default: 0 },
  zelle: { type: Number, default: 0 },
  referenciaZ: { type: String, default: "" },
  bancoZ: { type: String, default: "" }

}, { timestamps: true });

export default mongoose.model("Moneda", MonedaSchema);
