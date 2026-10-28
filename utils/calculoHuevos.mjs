// Las cantidades de huevos se controlan en unidades enteras.

export function entero(valor, nombre, minimo = 0) {
  if (
    typeof valor !== "number" ||
    !Number.isSafeInteger(valor) ||
    valor < minimo
  ) {
    throw new Error(
      `${nombre}: debe ser un número entero mayor o igual a ${minimo}.`
    );
  }

  return valor;
}

export function sumarSeguro(a, b) {
  const suma = a + b;

  if (!Number.isSafeInteger(suma)) {
    throw new Error(
      "La cantidad excede el rango permitido."
    );
  }

  return suma;
}

// CONVERTIR UNIDADES A CARTONES, MEDIOS Y SUELTOS
export function equivalenciaHuevos(unidades) {
  entero(unidades, "Huevos");

  const cartones = Math.floor(unidades / 30);
  const resto = unidades % 30;

  return {
    unidades,
    cartones,
    mediosCartones: Math.floor(resto / 15),
    sueltos: resto % 15
  };
}

// CALCULAR HUEVOS SEGÚN LA PRESENTACIÓN
export function huevosPorPresentacion(
  presentacion,
  cantidad
) {
  entero(cantidad, "Cantidad de presentaciones", 1);

  const factor = {
    CARTON: 30,
    MEDIO_CARTON: 15
  }[presentacion];

  if (!factor) {
    throw new Error(
      "Seleccione cartón de 30 o medio cartón de 15."
    );
  }

  return entero(
    cantidad * factor,
    "Huevos vendidos",
    1
  );
}

// CALCULAR PRODUCCIÓN APTA
export function produccionHuevos(
  recogidos,
  descartados
) {
  entero(recogidos, "Huevos recogidos");
  entero(descartados, "Huevos descartados");

  if (descartados > recogidos) {
    throw new Error(
      "Los descartados superan los recogidos."
    );
  }

  return {
    recogidos,
    descartados,
    aptos: recogidos - descartados
  };
}

// COMPROBAR LA RECEPCIÓN EN TIENDITA
export function recepcionHuevos(
  enviados,
  recibidos,
  partidos,
  faltantes,
  motivo = ""
) {
  entero(enviados, "Huevos enviados", 1);
  entero(recibidos, "Huevos recibidos aptos");
  entero(partidos, "Huevos partidos al recibir");
  entero(faltantes, "Huevos faltantes");

  const total = sumarSeguro(
    sumarSeguro(recibidos, partidos),
    faltantes
  );

  if (total !== enviados) {
    throw new Error(
      "Los recibidos, partidos y faltantes deben sumar los enviados."
    );
  }

  if (
    (partidos || faltantes) &&
    (
      typeof motivo !== "string" ||
      !motivo.trim()
    )
  ) {
    throw new Error(
      "Indique el motivo de la diferencia."
    );
  }

  return {
    enviados,
    recibidos,
    partidos,
    faltantes,
    diferencias: partidos + faltantes
  };
}

// CALCULAR SALDOS Y HUEVOS EN TRÁNSITO
// Un cobro no vuelve a descontar los huevos vendidos.
export function saldoHuevos(movimientos) {
  const saldo = {
    MONASTERIO: 0,
    TIENDITA: 0,
    enTransito: 0
  };

  const tipos = [
    "PRODUCCION",
    "CONSUMO",
    "MERMA",
    "VENTA",
    "ENVIO",
    "RECEPCION"
  ];

  for (const mov of movimientos) {
    if (!tipos.includes(mov.tipo)) {
      throw new Error(
        "Tipo de movimiento de huevos inválido."
      );
    }

    if (
      !["MONASTERIO", "TIENDITA"].includes(mov.sede)
    ) {
      throw new Error("Sede inválida.");
    }

    entero(
      mov.unidades,
      "Unidades del movimiento",
      mov.tipo === "RECEPCION" ? 0 : 1
    );

    if (mov.tipo === "PRODUCCION") {
      if (mov.sede !== "MONASTERIO") {
        throw new Error(
          "La producción corresponde al Monasterio."
        );
      }

      saldo.MONASTERIO = sumarSeguro(
        saldo.MONASTERIO,
        mov.unidades
      );
    } else if (mov.tipo === "ENVIO") {
      if (mov.sede !== "MONASTERIO") {
        throw new Error(
          "El envío debe salir del Monasterio."
        );
      }

      saldo.MONASTERIO -= mov.unidades;

      saldo.enTransito = sumarSeguro(
        saldo.enTransito,
        mov.unidades
      );
    } else if (mov.tipo === "RECEPCION") {
      if (mov.sede !== "TIENDITA") {
        throw new Error(
          "La recepción corresponde a Tiendita."
        );
      }

      const recepcion = recepcionHuevos(
        mov.enviados,
        mov.unidades,
        mov.partidos,
        mov.faltantes,
        mov.motivo
      );

      saldo.enTransito -= recepcion.enviados;

      saldo.TIENDITA = sumarSeguro(
        saldo.TIENDITA,
        recepcion.recibidos
      );
    } else {
      saldo[mov.sede] -= mov.unidades;
    }

    if (
      saldo.MONASTERIO < 0 ||
      saldo.TIENDITA < 0 ||
      saldo.enTransito < 0
    ) {
      throw new Error(
        "El movimiento supera las existencias disponibles."
      );
    }
  }

  return saldo;
}