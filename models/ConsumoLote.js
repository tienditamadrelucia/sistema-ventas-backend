import mongoose from "mongoose";

const detalleConsumoSchema = new mongoose.Schema(
  {
    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    codigo: {
      type: Number,
      required: true
    },

    descripcion: {
      type: String,
      required: true,
      trim: true
    },

    pesoKg: {
      type: Number,
      required: true,
      min: 0.001,
      validate: {
        validator: (valor) =>
          Number.isFinite(valor) &&
          Number.isSafeInteger(
            Math.round(valor * 1000)
          ) &&
          Math.abs(
            valor * 1000 -
            Math.round(valor * 1000)
          ) < 0.000001,
        message:
          "El peso debe tener como máximo tres decimales."
      }
    },

    presentacion: {
      type: String,
      enum: ["PIEZA", "PAQUETE_DOS", "SOLO_PESO"],
      required: true
    },

    cantidadPresentaciones: {
      type: Number,
      default: null
    },

    // Salida de inventario creada junto con el consumo.
    salidaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "dbSalidas",
      required: true
    }
  },
  {
    _id: false
  }
);

detalleConsumoSchema.pre("validate", function () {
  if (this.presentacion === "SOLO_PESO") {
    if (this.cantidadPresentaciones !== null) {
      throw new Error(
        "Este producto se retira únicamente por peso."
      );
    }

    return;
  }

  if (
    !Number.isSafeInteger(this.cantidadPresentaciones) ||
    this.cantidadPresentaciones <= 0
  ) {
    throw new Error(
      "Indique una cantidad entera de piezas o paquetes mayor que cero."
    );
  }
});

const ConsumoLoteSchema = new mongoose.Schema(
  {
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      required: true
    },

    fecha: {
      type: Date,
      required: true
    },

    // Sede de donde se retiran las existencias.
    sede: {
      type: String,
      enum: ["TIENDITA", "MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    destino: {
      type: String,
      enum: [
        "COCINA_MONASTERIO",
        "PASAPALOS",
        "CELEBRACION",
        "OTRO"
      ],
      required: true
    },

    observaciones: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },

    detalles: {
      type: [detalleConsumoSchema],
      required: true,
      validate: {
        validator: (detalles) => {
          if (!detalles || detalles.length === 0) {
            return false;
          }

          const productos = detalles.map(
            (detalle) => String(detalle.productoId)
          );

          return new Set(productos).size === productos.length;
        },
        message:
          "Registre al menos un producto y no lo repita."
      }
    },

    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true
    },

    claveOperacion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    }
  },
  {
    timestamps: true
  }
);

ConsumoLoteSchema.index(
  {
    loteId: 1,
    registradoPor: 1,
    claveOperacion: 1
  },
  {
    unique: true
  }
);

ConsumoLoteSchema.index({
  loteId: 1,
  sede: 1,
  fecha: -1
});

export default mongoose.model(
  "ConsumoLote",
  ConsumoLoteSchema
);