import mongoose from "mongoose";

const detalleProduccionSchema = new mongoose.Schema(
  {
    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    // Se conserva la identificación del producto
    // al momento de registrar la producción.
    codigo: {
      type: Number,
      required: true
    },

    descripcion: {
      type: String,
      required: true,
      trim: true
    },

    tipoProducto: {
      type: String,
      enum: [
        "PECHUGA",
        "MUSLOS",
        "ALAS",
        "PATAS",
        "POLLO_ENTERO",
        "MILANESA",
        "CHURRASCO"
      ],
      required: true
    },

    pesoKg: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (valor) =>
          Number.isFinite(valor) &&
          valor > 0 &&
          Number.isSafeInteger(
            Math.round(valor * 1000)
          ) &&
          Math.abs(
            valor * 1000 -
            Math.round(valor * 1000)
          ) < 0.000001,
        message:
          "El peso debe ser mayor que cero y tener como máximo tres decimales."
      }
    },

    presentacion: {
      type: String,
      enum: [
        "PIEZA",
        "PAQUETE_DOS",
        "SOLO_PESO"
      ],
      required: true
    },

    // Pechugas y pollos enteros: piezas.
    // Muslos: paquetes de dos unidades.
    // Productos vendidos sólo por peso: null.
    cantidadPresentaciones: {
      type: Number,
      default: null
    },

    // Entrada al inventario creada junto con
    // esta producción, dentro de la misma operación.
    entradaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entrada",
      required: true
    }
  },
  {
    _id: false
  }
);

detalleProduccionSchema.pre("validate", function () {
  const presentaciones = {
    PECHUGA: "PIEZA",
    MUSLOS: "PAQUETE_DOS",
    ALAS: "SOLO_PESO",
    PATAS: "SOLO_PESO",
    POLLO_ENTERO: "PIEZA",
    MILANESA: "SOLO_PESO",
    CHURRASCO: "SOLO_PESO"
  };

  if (
    this.presentacion !==
    presentaciones[this.tipoProducto]
  ) {
    throw new Error(
      "La presentación no corresponde al producto."
    );
  }

  if (this.presentacion === "SOLO_PESO") {
    if (this.cantidadPresentaciones !== null) {
      throw new Error(
        "Este producto se registra únicamente por peso."
      );
    }

    return;
  }

  if (
    !Number.isSafeInteger(
      this.cantidadPresentaciones
    ) ||
    this.cantidadPresentaciones <= 0
  ) {
    throw new Error(
      "Indique una cantidad entera de piezas o paquetes mayor que cero."
    );
  }
});

const ProduccionPolloSchema = new mongoose.Schema(
  {
    loteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoteCrianza",
      required: true
    },

    sede: {
      type: String,
      enum: ["MONASTERIO"],
      default: "MONASTERIO",
      required: true
    },

    fecha: {
      type: Date,
      required: true
    },

    pollosProcesados: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "Los pollos procesados deben ser una cantidad entera."
      }
    },

    detalles: {
      type: [detalleProduccionSchema],
      required: true,
      validate: {
        validator: (detalles) => {
          if (!detalles || detalles.length === 0) {
            return false;
          }

          const productos = detalles.map(
            (detalle) => String(detalle.productoId)
          );

          const tipos = detalles.map(
            (detalle) => detalle.tipoProducto
          );

          return (
            new Set(productos).size ===
              productos.length &&
            new Set(tipos).size === tipos.length
          );
        },
        message:
          "Registre al menos un producto, sin repetir productos ni tipos."
      }
    },

    observaciones: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
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

ProduccionPolloSchema.index(
  {
    loteId: 1,
    claveOperacion: 1
  },
  {
    unique: true
  }
);

ProduccionPolloSchema.index({
  loteId: 1,
  fecha: -1
});

export default mongoose.model(
  "ProduccionPollo",
  ProduccionPolloSchema
);