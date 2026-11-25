import mongoose from "mongoose";

const { Schema } = mongoose;

const referencia = (modelo, obligatorio = true) => ({
  type: Schema.Types.ObjectId,
  ref: modelo,
  required: obligatorio
});

const entero = {
  validator: Number.isSafeInteger,
  message: "Debe ser un número entero."
};

// GRUPOS DE GALLINAS
const grupoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    fechaInicio: {
      type: Date,
      required: true
    },
    cantidadInicial: {
      type: Number,
      required: true,
      min: 1,
      validate: entero
    },
    observaciones: {
      type: String,
      default: "",
      maxlength: 2000
    },
    creadoPor: referencia("Usuario"),
    activo: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

grupoSchema.index({ fechaInicio: -1, _id: -1 });

// PRODUCTOS VINCULADOS AL CONTROL DE HUEVOS
const configuracionSchema = new Schema(
  {
    _id: {
      type: String,
      default: "HUEVOS"
    },
    fechaInicioControl: {
      type: Date,
      required: true
    },
    productoMonasterioId: referencia("Producto"),
    productoTienditaId: referencia("Producto"),
    actividadProductiva: referencia("ActividadProductiva"),
    creadoPor: referencia("Usuario"),
    revision: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// RECEPCIÓN EN TIENDITA
const recepcionSchema = new Schema(
  {
    fecha: {
      type: Date,
      required: true
    },
    recibidos: {
      type: Number,
      required: true,
      min: 0,
      validate: entero
    },
    partidos: {
      type: Number,
      required: true,
      min: 0,
      validate: entero
    },
    faltantes: {
      type: Number,
      required: true,
      min: 0,
      validate: entero
    },
    motivo: {
      type: String,
      default: "",
      maxlength: 2000
    },
    observaciones: {
      type: String,
      default: "",
      maxlength: 2000
    },
    usuario: referencia("Usuario"),
    entradaId: {
      ...referencia("Entrada", false),
      default: null
    }
  },
  { _id: false }
);

// PRODUCCIÓN, BAJAS, CONSUMO, PÉRDIDAS Y ENVÍOS
const movimientoSchema = new Schema(
  {
    grupoId: referencia("GrupoGallinas"),
    tipo: {
      type: String,
      enum: [
        "PRODUCCION",
        "BAJA",
        "CONSUMO",
        "MERMA",
        "ENVIO"
      ],
      required: true
    },
    fecha: {
      type: Date,
      required: true
    },
    sede: {
      type: String,
      enum: ["MONASTERIO", "TIENDITA"],
      required: true
    },
    unidades: {
      type: Number,
      required: true,
      min: 0,
      validate: entero
    },
    recogidos: {
      type: Number,
      min: 0,
      validate: entero
    },
    descartados: {
      type: Number,
      min: 0,
      validate: entero
    },
    motivo: {
      type: String,
      default: "",
      maxlength: 2000
    },
    observaciones: {
      type: String,
      default: "",
      maxlength: 2000
    },
    usuario: referencia("Usuario"),
    entradaId: {
      ...referencia("Entrada", false),
      default: null
    },
    salidaId: {
      ...referencia("dbSalidas", false),
      default: null
    },
    recepcion: {
      type: recepcionSchema,
      default: undefined
    }
  },
  { timestamps: true }
);

movimientoSchema.index({
  grupoId: 1,
  fecha: 1,
  _id: 1
});

movimientoSchema.index({
  tipo: 1,
  "recepcion.fecha": 1
});

movimientoSchema.pre("validate", function () {
  if (
    this.tipo === "PRODUCCION" &&
    (
      this.sede !== "MONASTERIO" ||
      !Number.isSafeInteger(this.recogidos) ||
      !Number.isSafeInteger(this.descartados) ||
      this.recogidos - this.descartados !== this.unidades
    )
  ) {
    throw new Error("Producción de huevos inconsistente.");
  }

  if (this.tipo !== "PRODUCCION" && this.unidades < 1) {
    throw new Error("La cantidad debe ser positiva.");
  }

  if (
    this.tipo === "ENVIO" &&
    this.sede !== "MONASTERIO"
  ) {
    throw new Error("Origen de envío inválido.");
  }

  if (this.recepcion) {
    const r = this.recepcion;

    if (
      this.tipo !== "ENVIO" ||
      r.fecha < this.fecha ||
      r.recibidos + r.partidos + r.faltantes !== this.unidades ||
      ((r.partidos || r.faltantes) && !r.motivo.trim()) ||
      (r.recibidos > 0 && !r.entradaId) ||
      (r.recibidos === 0 && r.entradaId)
    ) {
      throw new Error("Recepción de huevos inconsistente.");
    }
  }
});

// SOLICITUDES CONFIRMADAS: EVITA DUPLICADOS AL REINTENTAR
const operacionSchema = new Schema(
  {
    _id: {
      type: String,
      required: true
    },
    firma: {
      type: String,
      required: true
    },
    usuario: referencia("Usuario"),
    respuesta: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  { timestamps: true }
);

// HISTORIAL DE CAMBIOS
const auditoriaSchema = new Schema(
  {
    usuario: referencia("Usuario"),
    accion: {
      type: String,
      required: true
    },
    entidadId: {
      type: String,
      required: true
    },
    antes: Schema.Types.Mixed,
    despues: Schema.Types.Mixed
  },
  { timestamps: true }
);

// CONCILIACIÓN ADMINISTRATIVA DE INVENTARIO DE HUEVOS
const conciliacionGrupoSchema = new Schema({
  grupoId: referencia("GrupoGallinas"),
  saldoAnterior: { type: Number, required: true, validate: entero },
  saldoConciliado: { type: Number, required: true, min: 0, validate: entero },
  diferencia: { type: Number, required: true, validate: entero }
}, { _id: false });

const conciliacionSchema = new Schema({
  sede: {
    type: String,
    enum: ["MONASTERIO", "TIENDITA"],
    required: true
  },
  productoId: referencia("Producto"),
  fecha: { type: Date, required: true },
  existenciaGeneralAnterior: { type: Number, required: true, validate: entero },
  existenciaGruposAnterior: { type: Number, required: true, validate: entero },
  existenciaFisica: { type: Number, required: true, min: 0, validate: entero },
  diferenciaGeneral: { type: Number, required: true, validate: entero },
  diferenciaGrupos: { type: Number, required: true, validate: entero },
  grupos: { type: [conciliacionGrupoSchema], default: [] },
  motivo: { type: String, required: true, trim: true, maxlength: 2000 },
  usuario: referencia("Usuario"),
  entradaId: { ...referencia("Entrada", false), default: null },
  salidaId: { ...referencia("dbSalidas", false), default: null }
}, { timestamps: true });

conciliacionSchema.index({ sede: 1, fecha: -1, _id: -1 });

conciliacionSchema.pre("validate", function () {
  const ids = this.grupos.map(g => String(g.grupoId));
  const saldoAnterior = this.grupos.reduce((s, g) => s + g.saldoAnterior, 0);
  const saldoConciliado = this.grupos.reduce((s, g) => s + g.saldoConciliado, 0);

  if (
    new Set(ids).size !== ids.length ||
    saldoAnterior !== this.existenciaGruposAnterior ||
    saldoConciliado > this.existenciaFisica ||
    this.diferenciaGeneral !== this.existenciaFisica - this.existenciaGeneralAnterior ||
    this.diferenciaGrupos !== saldoConciliado - saldoAnterior ||
    this.grupos.some(g => g.diferencia !== g.saldoConciliado - g.saldoAnterior)
  ) {
    throw new Error("Conciliación de huevos inconsistente.");
  }
});

export const GrupoGallinas = mongoose.model(
  "GrupoGallinas",
  grupoSchema
);

export const ConfiguracionHuevos = mongoose.model(
  "ConfiguracionHuevos",
  configuracionSchema
);

export const MovimientoHuevos = mongoose.model(
  "MovimientoHuevos",
  movimientoSchema
);

export const OperacionHuevos = mongoose.model(
  "OperacionHuevos",
  operacionSchema
);

export const AuditoriaHuevos = mongoose.model(
  "AuditoriaHuevos",
  auditoriaSchema
);

export const ConciliacionHuevos = mongoose.model(
  "ConciliacionHuevos",
  conciliacionSchema
);