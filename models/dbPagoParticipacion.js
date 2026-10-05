import mongoose from "mongoose";

const PagoParticipacionSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true
    },

    // Sede que entrega el dinero
    sedePaga: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    // Sede que recibe el dinero
    sedeRecibe: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      required: true
    },

    monto: {
      type: Number,
      required: true,
      min: 0.01
    },

    // ==========================================
    // DOCUMENTO DE LA SEDE QUE PAGA
    // Ambas sedes utilizan RECIBO DE GASTOS
    // ==========================================
    numeroReciboGasto: {
      type: String,
      required: true,
      trim: true
    },

    // ==========================================
    // DOCUMENTO DE LA SEDE QUE RECIBE
    // Solo se usa cuando recibe MONASTERIO.
    // Si recibe TIENDITA, se genera factura.
    // ==========================================
    numeroReciboIngreso: {
      type: String,
      default: "",
      trim: true
    },

    // Si recibe TIENDITA, guardamos aquí
    // el número de factura generado.
    facturaIngresoTiendita: {
      type: Number,
      default: null
    },

    // ==========================================
    // ENLACES A LOS MOVIMIENTOS GENERADOS
    // ==========================================
    gastoGenerado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gastos",
      default: null
    },

    ingresoGenerado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ventas",
      default: null
    },

    observacion: {
      type: String,
      default: "",
      trim: true
    },

    usuario: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);


// =====================================================
// VALIDACIONES
// =====================================================
PagoParticipacionSchema.pre("validate", function (next) {

  if (this.sedePaga === this.sedeRecibe) {
    return next(
      new Error(
        "La sede que paga y la sede que recibe no pueden ser la misma."
      )
    );
  }

  if (!this.numeroReciboGasto?.trim()) {
    return next(
      new Error(
        "El número del recibo de gastos es obligatorio."
      )
    );
  }

  // Si recibe MONASTERIO:
  // debe existir recibo de ingreso.
  if (
    this.sedeRecibe === "MONASTERIO" &&
    !this.numeroReciboIngreso?.trim()
  ) {
    return next(
      new Error(
        "El número del recibo de ingreso del Monasterio es obligatorio."
      )
    );
  }

  // Si recibe TIENDITA:
  // no existe recibo de ingreso.
  if (this.sedeRecibe === "TIENDITA") {
    this.numeroReciboIngreso = "";
  }

  next();
});


export default mongoose.model(
  "PagoParticipacion",
  PagoParticipacionSchema
);