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
VentaSchema.pre("validate", function (next) {

  // ==================================================
  // 1. VENTA NORMAL
  // ==================================================
  if (this.tipoMovimiento === "VENTA") {

    if (
      this.factura === null ||
      this.factura === undefined
    ) {
      return next(
        new Error(
          "La factura es obligatoria para una venta."
        )
      );
    }

    if (!this.cliente) {
      return next(
        new Error(
          "El cliente es obligatorio para una venta."
        )
      );
    }

    // Una venta normal no debe tener
    // información de otro ingreso
    this.numeroReciboIngreso = "";
    this.conceptoIngreso = "";
    this.origenIngreso = "NINGUNO";
    this.sedeOrigenIngreso = "NINGUNA";
  }


  // ==================================================
  // 2. OTRO INGRESO
  // ==================================================
  if (this.tipoMovimiento === "OTRO_INGRESO") {

    if (!this.conceptoIngreso) {
      return next(
        new Error(
          "El concepto del ingreso es obligatorio."
        )
      );
    }

    const esParticipacionTiendita =
      this.sede === "TIENDITA" &&
      this.origenIngreso === "PARTICIPACION";


    // ================================================
    // TIENDITA RECIBE PARTICIPACIÓN
    // Se documenta mediante FACTURA
    // ================================================
    if (esParticipacionTiendita) {

      if (
        this.factura === null ||
        this.factura === undefined
      ) {
        return next(
          new Error(
            "La factura es obligatoria para una participación recibida por Tiendita."
          )
        );
      }

      // Tiendita no utiliza recibo de ingreso
      this.numeroReciboIngreso = "";
    }


    // ================================================
    // MONASTERIO RECIBE PARTICIPACIÓN
    // Se documenta mediante RECIBO DE INGRESO
    // ================================================
    else {

      if (!this.numeroReciboIngreso) {
        return next(
          new Error(
            "El número del recibo de ingreso es obligatorio."
          )
        );
      }

      // El Monasterio no genera factura
      // por esta liquidación
      this.factura = null;
    }


    // Un ingreso por participación no es
    // una venta a crédito de un cliente
    this.cliente = "";
    this.subtotal = this.total;
    this.IVA = 0;
    this.estado = "CONTADO";
  }


  // ==================================================
  // TERMINAR VALIDACIÓN
  // ==================================================
  next();
});


export default mongoose.model(
  "ventas",
  VentaSchema
);
