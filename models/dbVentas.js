import mongoose from "mongoose";

const VentaSchema = new mongoose.Schema(
  {
    fecha: {
      type: Date,
      required: true
    },

    hora: {
      type: String,
      required: true
    },

    // ==========================================
    // TIPO DE MOVIMIENTO
    // ==========================================
    tipoMovimiento: {
      type: String,
      enum: ["VENTA", "OTRO_INGRESO"],
      default: "VENTA",
      required: true
    },

    // ==========================================
    // DATOS DE VENTA / FACTURA
    // ==========================================
    factura: {
      type: Number,
      default: null
    },

    cliente: {
      type: String,
      default: ""
    },

    subtotal: {
      type: Number,
      default: 0
    },

    IVA: {
      type: Number,
      default: 0
    },

    total: {
      type: Number,
      required: true
    },

    usuario: {
      type: String,
      required: true
    },

    estado: {
      type: String,
      enum: ["CONTADO", "CREDITO"],
      default: "CONTADO"
    },

    // ==========================================
    // OTROS INGRESOS
    // ==========================================
    numeroReciboIngreso: {
      type: String,
      default: "",
      trim: true
    },

    conceptoIngreso: {
      type: String,
      default: "",
      trim: true
    },

    origenIngreso: {
      type: String,
      enum: ["NINGUNO", "PARTICIPACION"],
      default: "NINGUNO"
    },

    sedeOrigenIngreso: {
      type: String,
      enum: [
        "TIENDITA",
        "MONASTERIO",
        "NINGUNA"
      ],
      default: "NINGUNA"
    },

    // ==========================================
    // SEDE
    // ==========================================
    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      default: "TIENDITA",
      required: true
    },

    cierre: {
      type: String,
      default: "N"
    }
  },
  {
    timestamps: true
  }
);


// =====================================================
// VALIDACIONES SEGÚN EL TIPO DE MOVIMIENTO
// =====================================================
VentaSchema.pre("validate", function () {
  // VENTA NORMAL
  if (this.tipoMovimiento === "VENTA") {
    if (this.factura === null || this.factura === undefined) {
      throw new Error("La factura es obligatoria para una venta.");
    }

    if (!this.cliente) {
      throw new Error("El cliente es obligatorio para una venta.");
    }

    this.numeroReciboIngreso = "";
    this.conceptoIngreso = "";
    this.origenIngreso = "NINGUNO";
    this.sedeOrigenIngreso = "NINGUNA";
  }

  // OTRO INGRESO
  if (this.tipoMovimiento === "OTRO_INGRESO") {
    if (!this.conceptoIngreso) {
      throw new Error("El concepto del ingreso es obligatorio.");
    }

    const esParticipacionTiendita =
      this.sede === "TIENDITA" &&
      this.origenIngreso === "PARTICIPACION";

    // TIENDITA recibe participación mediante FACTURA
    if (esParticipacionTiendita) {
      if (this.factura === null || this.factura === undefined) {
        throw new Error("La factura es obligatoria para una participación recibida por Tiendita.");
      }

      this.numeroReciboIngreso = "";
    } else {
      // MONASTERIO recibe mediante RECIBO DE INGRESO
      if (!this.numeroReciboIngreso) {
        throw new Error("El número del recibo de ingreso es obligatorio.");
      }

      this.factura = null;
    }

    this.cliente = "";
    this.subtotal = this.total;
    this.IVA = 0;
    this.estado = "CONTADO";
  }
});

export default mongoose.model(
  "ventas",
  VentaSchema
);
