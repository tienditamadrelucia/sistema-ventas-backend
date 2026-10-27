const TIPOS = [
  "PECHUGA",
  "MUSLOS",
  "ALAS",
  "PATAS",
  "POLLO_ENTERO",
  "MILANESA",
  "CHURRASCO"
];

function numero(valor) {
  return typeof valor === "number" ||
    (
      typeof valor === "string" &&
      valor.trim() !== ""
    )
      ? Number(valor)
      : NaN;
}

function gramos(valor, permiteCero = false) {
  const peso = numero(valor);
  const resultado = Math.round(peso * 1000);

  return (
    Number.isFinite(peso) &&
    peso >= 0 &&
    Number.isSafeInteger(resultado) &&
    (permiteCero ? resultado >= 0 : resultado > 0) &&
    Math.abs(peso * 1000 - resultado) < 0.000001
  )
    ? resultado
    : NaN;
}

function comparar(esperados, registrados, nombre) {
  const valido =
    Number.isSafeInteger(esperados) &&
    Number.isSafeInteger(registrados);

  const diferencia = valido
    ? esperados - registrados
    : null;

  return {
    esperados: valido ? esperados : null,
    registrados: valido ? registrados : null,
    diferencia,
    completo: valido && diferencia === 0,
    mensaje: !valido
      ? `Complete las cantidades de ${nombre}.`
      : diferencia > 0
        ? `Faltan ${diferencia} ${nombre} por registrar.`
        : diferencia < 0
          ? `Se registraron ${-diferencia} ${nombre} de más.`
          : `${nombre}: cantidad completa (${registrados} de ${esperados}).`
  };
}

export function evaluarControlProduccion(datos = {}) {
  const errores = [];
  const pollos = numero(datos.pollosProcesados);

  const pollosValidos =
    Number.isSafeInteger(pollos) &&
    pollos > 0 &&
    Number.isSafeInteger(pollos * 2);

  if (!pollosValidos) {
    errores.push(
      "Indique una cantidad entera de pollos procesados."
    );
  }

  const detalles = Array.isArray(datos.detalles)
    ? datos.detalles
    : [];

  const cantidades = {};
  let pesoProductos = 0;
  let pesosValidos = true;

  if (detalles.length === 0 || detalles.length > 7) {
    errores.push(
      "Registre entre uno y siete productos obtenidos."
    );
  }

  for (const detalle of detalles) {
    const tipo = detalle?.tipoProducto;

    if (
      !TIPOS.includes(tipo) ||
      Object.prototype.hasOwnProperty.call(
        cantidades,
        tipo
      )
    ) {
      errores.push(
        "Hay tipos de producto repetidos o no válidos."
      );
      continue;
    }

    const peso = gramos(detalle.pesoKg);

    if (!Number.isFinite(peso)) {
      errores.push(
        `Revise el peso de ${tipo}: use hasta tres decimales.`
      );

      pesosValidos = false;
    } else {
      pesoProductos += peso;
    }

    let campo = "";

    if (
      ["PECHUGA", "MUSLOS", "POLLO_ENTERO"].includes(tipo)
    ) {
      campo = "cantidadPresentaciones";
    } else if (tipo === "MILANESA") {
      campo = "pechugasUtilizadas";
    } else if (tipo === "CHURRASCO") {
      campo = "muslosUtilizados";
    }

    let cantidad = campo
      ? numero(detalle[campo])
      : 0;

    if (
      campo &&
      (
        !Number.isSafeInteger(cantidad) ||
        cantidad <= 0
      )
    ) {
      errores.push(
        `Complete la cantidad de referencia de ${tipo}.`
      );

      cantidad = NaN;
    }

    cantidades[tipo] = cantidad;
  }

  const cantidadDe = (tipo) =>
    Object.prototype.hasOwnProperty.call(
      cantidades,
      tipo
    )
      ? cantidades[tipo]
      : 0;

  const pechugas = comparar(
    pollosValidos ? pollos : NaN,
    cantidadDe("PECHUGA") +
      cantidadDe("MILANESA") +
      cantidadDe("POLLO_ENTERO"),
    "pechugas"
  );

  const muslos = comparar(
    pollosValidos ? pollos * 2 : NaN,
    cantidadDe("MUSLOS") * 2 +
      cantidadDe("CHURRASCO") +
      cantidadDe("POLLO_ENTERO") * 2,
    "muslos"
  );

  const informado = (valor) =>
  valor !== undefined &&
  valor !== null &&
  !(
    typeof valor === "string" &&
    valor.trim() === ""
  );

const controlInformado = informado(datos.pesoControlKg);
const mermasInformadas = informado(datos.mermasKg);

const control = gramos(datos.pesoControlKg);
const mermas = gramos(datos.mermasKg, true);

if (
  mermasInformadas &&
  !Number.isFinite(mermas)
) {
  errores.push(
    "Revise las mermas: deben ser cero o positivas y tener hasta tres decimales."
  );
}

const pesosCompletos =
  pesosValidos &&
  detalles.length > 0 &&
  Number.isSafeInteger(pesoProductos) &&
  Number.isSafeInteger(control) &&
  Number.isSafeInteger(mermas) &&
  Number.isSafeInteger(pesoProductos + mermas);

const diferencia = pesosCompletos
  ? control - pesoProductos - mermas
  : null;

const peso = {
  productosKg:
    pesosValidos &&
    Number.isSafeInteger(pesoProductos)
      ? pesoProductos / 1000
      : null,

  controlKg: Number.isFinite(control)
    ? control / 1000
    : undefined,

  mermasKg: Number.isFinite(mermas)
    ? mermas / 1000
    : undefined,

  diferenciaKg: diferencia === null
    ? null
    : diferencia / 1000,

  pendiente: !controlInformado,

  completo:
    pesosCompletos && diferencia === 0,

  mensaje: !controlInformado
    ? "No se informó el peso global: se guardarán los kilos de cada producto sin conciliación global."
    : !pesosCompletos
      ? "Complete los pesos de productos, control y mermas (cero si no hubo)."
      : diferencia > 0
        ? `Faltan ${(diferencia / 1000).toFixed(3)} kg por justificar.`
        : diferencia < 0
          ? `El peso registrado excede el control en ${(-diferencia / 1000).toFixed(3)} kg.`
          : "Peso conciliado: productos y mermas coinciden con el peso de control."
};

for (const actual of [pechugas, muslos]) {
  if (!actual.completo) {
    errores.push(actual.mensaje);
  }
}

if (controlInformado && !peso.completo) {
  errores.push(peso.mensaje);
}

  return {
    valido: errores.length === 0,
    errores,
    pechugas,
    muslos,
    peso
  };
}

export function exigirControlProduccion(datos) {
  const control = evaluarControlProduccion(datos);

  if (!control.valido) {
    const error = new Error(
      control.errores.join(" ")
    );

    error.estado = 400;
    throw error;
  }

  return control;
}