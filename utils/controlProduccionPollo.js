const TIPOS = [
  "PECHUGA", "MUSLOS", "ALAS", "PATAS",
  "POLLO_ENTERO", "MILANESA", "CHURRASCO"
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

  if (detalles.length === 0 || detalles.length > 7) {
    errores.push(
      "Registre entre uno y siete productos obtenidos."
    );
  }

  const cantidades = {};
  let totalGramos = 0;
  let pesosValidos = true;

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

    const peso = numero(detalle.pesoKg);
    const gramos = Math.round(peso * 1000);

    if (
      !Number.isFinite(peso) ||
      peso <= 0 ||
      !Number.isSafeInteger(gramos) ||
      gramos <= 0 ||
      Math.abs(peso * 1000 - gramos) >= 0.000001
    ) {
      errores.push(
        `Revise los kilos de ${tipo}: deben ser mayores que cero y tener hasta tres decimales.`
      );

      pesosValidos = false;
    } else {
      totalGramos += gramos;
    }

    const campo =
      tipo === "MILANESA"
        ? "pechugasUtilizadas"
        : tipo === "CHURRASCO"
          ? "muslosUtilizados"
          : ["PECHUGA", "MUSLOS", "POLLO_ENTERO"].includes(tipo)
            ? "cantidadPresentaciones"
            : "";

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

  const kilosValidos =
    pesosValidos &&
    detalles.length > 0 &&
    Number.isSafeInteger(totalGramos);

  const peso = {
    productosKg: kilosValidos
      ? totalGramos / 1000
      : null,

    controlKg: undefined,
    mermasKg: undefined,
    diferenciaKg: null,
    pendiente: false,
    completo: kilosValidos,

    mensaje: kilosValidos
      ? `Peso total de productos: ${(totalGramos / 1000).toFixed(3)} kg.`
      : "Complete los kilos de cada producto registrado."
  };

  for (const actual of [pechugas, muslos, peso]) {
    if (!actual.completo) {
      errores.push(actual.mensaje);
    }
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