import mongoose from "mongoose";

const validarKilos = (valor) =>
  Number.isFinite(valor) &&
  Number.isSafeInteger(Math.round(valor * 1000)) &&
  Math.abs(
    valor * 1000 - Math.round(valor * 1000)
  ) < 0.000001;

// =====================================================
// DATOS CONFIRMADOS POR TIENDITA
// =====================================================
const recepcionProductoSchema = new mongoose.Schema(
  {
    productoDestinoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    codigoDestino: {
      type: Number,
      required: true
    },

    descripcionDestino: {
      type: String,
      required: true,
      trim: true
    },

    pesoRecibidoKg: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: validarKilos,
        message:
          "El peso recibido admite hasta tres decimales."
      }
    },

    presentacionesRecibidas: {
      type: Number,
      default: null
    },

    revisado: {
      type: Boolean,
      required: true,
      validate: {
        validator: (valor) => valor === true,
        message:
          "Debe revisar cada producto recibido."
      }
    },

    entradaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entrada",
      default: null,
      required: function () {
        return this.pesoRecibidoKg > 0;
      }
    }
  },
  {
    _id: false
  }
);

// =====================================================
// PRODUCTOS ENVIADOS DESDE MONASTERIO
// =====================================================
const detalleEnvioSchema = new mongoose.Schema(
  {
    productoOrigenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    codigoOrigen: {
      type: Number,
      required: true
    },

    descripcionOrigen: {
      type: String,
      required: true,
      trim: true
    },

    presentacion: {
      type: String,
      enum: ["PIEZA", "PAQUETE_DOS", "SOLO_PESO"],
      required: true
    },

    pesoEnviadoKg: {
      type: Number,
      required: true,
      min: 0.001,
      validate: {
        validator: validarKilos,
        message:
          "El peso enviado admite hasta tres decimales."
      }
    },

    presentacionesEnviadas: {
      type: Number,
      default: null
    },

    salidaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "dbSalidas",
      required: true
    },

    recepcion: {
      type: recepcionProductoSchema,
      default: undefined
    }
  },
  {
    _id: false
  }
);

detalleEnvioSchema.pre("validate", function () {
  const soloPeso = this.presentacion === "SOLO_PESO";

  if (
    soloPeso
      ? this.presentacionesEnviadas !== null
      : !Number.isSafeInteger(this.presentacionesEnviadas) ||
        this.presentacionesEnviadas <= 0
  ) {
    throw new Error(
      "Revise las piezas o paquetes enviados."
    );
  }

  if (!this.recepcion) return;

  const cantidad =
    this.recepcion.presentacionesRecibidas;

  if (
    soloPeso
      ? cantidad !== null
      : !Number.isSafeInteger(cantidad) || cantidad < 0
  ) {
    throw new Error(
      "Revise las piezas o paquetes recibidos."
    );
  }

  if (
    !soloPeso &&
    (
      (this.recepcion.pesoRecibidoKg === 0) !==
      (cantidad === 0)
    )
  ) {
    throw new Error(
      "Los kilos y las piezas o paquetes recibidos deben corresponder."
    );
  }

  if (
    this.recepcion.pesoRecibidoKg === 0 &&
    this.recepcion.entradaId
  ) {
    throw new Error(
      "No debe generarse una entrada si no se recibió ese producto."
    );
  }
});

// =====================================================
// ENVÍO COMPLETO
// =====================================================
const EnvioLoteSchema = new mongoose.Schema(
  {
    numeroEnvio: {
      type: String,
      required: true,
      trim: true
    },

    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      required: true
    },

    origen: {
      type: String,
      enum: ["MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    destino: {
      type: String,
      enum: ["TIENDITA"],
      default: "TIENDITA",
      required: true
    },

    fechaEnvio: {
      type: Date,
      required: true
    },

    estado: {
      type: String,
      enum: [
        "EN_TRANSITO",
        "RECIBIDO",
        "RECIBIDO_CON_DIFERENCIAS"
      ],
      default: "EN_TRANSITO",
      required: true
    },

    enviadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    observacionesEnvio: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },

    claveOperacion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    detalles: {
      type: [detalleEnvioSchema],
      required: true,
      validate: {
        validator: (detalles) =>
          detalles &&
          detalles.length > 0 &&
          detalles.length <= 7 &&
          new Set(
            detalles.map(
              (item) => String(item.productoOrigenId)
            )
          ).size === detalles.length,

        message:
          "Seleccione entre uno y siete productos sin repetirlos."
      }
    },

    fechaRecepcion: {
      type: Date,
      default: null
    },

    recibidoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null
    },

    claveRecepcion: {
      type: String,
      trim: true,
      maxlength: 100,
      default: undefined
    },

    observacionesRecepcion: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },

    motivoDiferencias: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },

    diferenciasPendientes: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

EnvioLoteSchema.pre("validate", function () {
  if (this.estado === "EN_TRANSITO") {
    if (
      this.fechaRecepcion ||
      this.recibidoPor ||
      this.claveRecepcion ||
      this.diferenciasPendientes ||
      this.detalles.some((item) => item.recepcion)
    ) {
      throw new Error(
        "Un envío en tránsito todavía no debe tener recepción confirmada."
      );
    }

    return;
  }

  if (
    !this.fechaRecepcion ||
    !this.recibidoPor ||
    !this.claveRecepcion ||
    this.detalles.some(
      (item) =>
        !item.recepcion ||
        item.recepcion.revisado !== true
    )
  ) {
    throw new Error(
      "Complete y revise todos los productos antes de confirmar la recepción."
    );
  }

  if (this.fechaRecepcion < this.fechaEnvio) {
    throw new Error(
      "La recepción no puede ser anterior al envío."
    );
  }

  const idsDestino = this.detalles.map(
    (item) =>
      String(item.recepcion.productoDestinoId)
  );

  if (new Set(idsDestino).size !== idsDestino.length) {
    throw new Error(
      "No puede usar el mismo producto de Tiendita en dos filas del envío."
    );
  }

  const hayDiferencias = this.detalles.some(
    (item) =>
      Math.round(item.pesoEnviadoKg * 1000) !==
        Math.round(item.recepcion.pesoRecibidoKg * 1000) ||
      item.presentacionesEnviadas !==
        item.recepcion.presentacionesRecibidas
  );

  if (
    hayDiferencias &&
    !this.motivoDiferencias.trim()
  ) {
    throw new Error(
      "Indique el motivo de las diferencias."
    );
  }

  const estadoEsperado = hayDiferencias
    ? "RECIBIDO_CON_DIFERENCIAS"
    : "RECIBIDO";

  if (
    this.estado !== estadoEsperado ||
    this.diferenciasPendientes !== hayDiferencias
  ) {
    throw new Error(
      "El estado de recepción no corresponde a las cantidades verificadas."
    );
  }
});

EnvioLoteSchema.index(
  { numeroEnvio: 1 },
  { unique: true }
);

EnvioLoteSchema.index(
  {
    loteId: 1,
    enviadoPor: 1,
    claveOperacion: 1
  },
  {
    unique: true
  }
);

EnvioLoteSchema.index({
  destino: 1,
  estado: 1,
  fechaEnvio: -1
});

export default mongoose.model(
  "EnvioLote",
  EnvioLoteSchema
);