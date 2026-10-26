function errorCompra(mensaje) {
  const error = new Error(mensaje);
  error.estado = 400;
  return error;
}

function enteroEscalado(valor, decimales, nombre) {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor <= 0
  ) {
    throw errorCompra(
      `${nombre} debe ser un número mayor que cero.`
    );
  }

  const factor = 10 ** decimales;
  const entero = Math.round(valor * factor);

  if (
    !Number.isSafeInteger(entero) ||
    entero <= 0 ||
    entero / factor !== valor
  ) {
    throw errorCompra(
      `${nombre} admite hasta ${decimales} decimales y debe estar dentro del rango permitido.`
    );
  }

  return entero;
}

function numeroSeguro(valor) {
  const numero = Number(valor);

  if (!Number.isSafeInteger(numero) || numero < 0) {
    throw errorCompra(
      "El importe de la compra excede el rango permitido."
    );
  }

  return numero;
}

function dividirRedondeando(numerador, denominador) {
  return (
    numerador + denominador / 2n
  ) / denominador;
}

// Distribuir centavos proporcionalmente, sin perder importe.
function repartir(importe, bases) {
  const suma = bases.reduce(
    (total, base) => total + BigInt(base),
    0n
  );

  if (suma <= 0n) {
    throw errorCompra(
      "No se puede distribuir un cargo sin productos."
    );
  }

  const partes = bases.map((base, indice) => {
    const numerador = BigInt(importe) * BigInt(base);

    return {
      indice,
      importe: numerador / suma,
      resto: numerador % suma
    };
  });

  const asignado = partes.reduce(
    (total, parte) => total + parte.importe,
    0n
  );

  const faltantes = numeroSeguro(
    BigInt(importe) - asignado
  );

  const orden = [...partes].sort((a, b) =>
    a.resto === b.resto
      ? a.indice - b.indice
      : a.resto > b.resto
      ? -1
      : 1
  );

  for (let i = 0; i < faltantes; i++) {
    orden[i].importe += 1n;
  }

  return partes.map((parte) =>
    numeroSeguro(parte.importe)
  );
}

export function normalizarCargos(cargos = []) {
  if (!Array.isArray(cargos) || cargos.length > 20) {
    throw errorCompra(
      "La compra admite hasta 20 impuestos o recargos."
    );
  }

  return cargos.map((cargo) => {
    if (
      !cargo ||
      typeof cargo !== "object" ||
      Array.isArray(cargo)
    ) {
      throw errorCompra("Cargo de compra inválido.");
    }

    if (
      typeof cargo.concepto !== "string" ||
      !cargo.concepto.trim() ||
      cargo.concepto.trim().length > 120
    ) {
      throw errorCompra(
        "Indique el concepto de cada cargo, con un máximo de 120 caracteres."
      );
    }

    if (!["PORCENTAJE", "MONTO"].includes(cargo.tipo)) {
      throw errorCompra(
        "El cargo debe ser un porcentaje o un monto."
      );
    }

    enteroEscalado(
      cargo.valor,
      cargo.tipo === "PORCENTAJE" ? 6 : 2,
      "El valor del cargo"
    );

    const baseCalculo =
      cargo.baseCalculo ?? "SUBTOTAL";

    if (
      !["SUBTOTAL", "TOTAL_ACUMULADO"].includes(baseCalculo)
    ) {
      throw errorCompra(
        "Base de cálculo del cargo inválida."
      );
    }

    const incorporaCosto = cargo.incorporaCosto ?? true;

    if (typeof incorporaCosto !== "boolean") {
      throw errorCompra(
        "Indique si el cargo se incorpora al costo."
      );
    }

    return {
      concepto: cargo.concepto.trim(),
      tipo: cargo.tipo,
      valor: cargo.valor,
      baseCalculo,
      incorporaCosto
    };
  });
}

export function calcularImportesCompra(detalles, cargos = []) {
  if (
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    detalles.length > 200
  ) {
    throw errorCompra(
      "La compra debe contener entre 1 y 200 productos."
    );
  }

  const vistos = new Set();

  const lineas = detalles
    .map((detalle) => {
      if (
        !detalle ||
        typeof detalle.productoId !== "string" ||
        !/^[a-f\d]{24}$/i.test(detalle.productoId)
      ) {
        throw errorCompra("Producto de compra inválido.");
      }

      const productoId = detalle.productoId.toLowerCase();

      if (vistos.has(productoId)) {
        throw errorCompra(
          "Un producto no puede aparecer dos veces en la compra."
        );
      }

      vistos.add(productoId);

      const cantidad = enteroEscalado(
        detalle.cantidad,
        3,
        "La cantidad"
      );

      const precio = enteroEscalado(
        detalle.costoUnitarioMoneda,
        6,
        "El costo unitario"
      );

      const base = numeroSeguro(
        dividirRedondeando(
          BigInt(cantidad) * BigInt(precio),
          10000000n
        )
      );

      if (base <= 0) {
        throw errorCompra(
          "El subtotal de cada producto debe ser al menos un centavo."
        );
      }

      return {
        productoId,
        cantidad: detalle.cantidad,
        costoUnitarioMoneda: detalle.costoUnitarioMoneda,
        base,
        cargoCosto: 0n,
        cargoNoCosto: 0n
      };
    })
    .sort((a, b) =>
      a.productoId.localeCompare(b.productoId)
    );

  const subtotal = numeroSeguro(
    lineas.reduce(
      (total, linea) => total + BigInt(linea.base),
      0n
    )
  );

  const normalizados = normalizarCargos(cargos);

  let total = subtotal;
  let costo = 0n;
  let noCosto = 0n;

  const calculados = [];

  for (const cargo of normalizados) {
    const base =
      cargo.baseCalculo === "TOTAL_ACUMULADO"
        ? total
        : subtotal;

    const importe =
      cargo.tipo === "MONTO"
        ? enteroEscalado(
            cargo.valor,
            2,
            "El monto del cargo"
          )
        : numeroSeguro(
            dividirRedondeando(
              BigInt(base) *
                BigInt(
                  enteroEscalado(
                    cargo.valor,
                    6,
                    "El porcentaje"
                  )
                ),
              100000000n
            )
          );

    const bases =
      cargo.baseCalculo === "TOTAL_ACUMULADO"
        ? lineas.map((linea) =>
            numeroSeguro(
              BigInt(linea.base) +
                linea.cargoCosto +
                linea.cargoNoCosto
            )
          )
        : lineas.map((linea) => linea.base);

    const partes = repartir(importe, bases);

    partes.forEach((parte, indice) => {
      if (cargo.incorporaCosto) {
        lineas[indice].cargoCosto += BigInt(parte);
      } else {
        lineas[indice].cargoNoCosto += BigInt(parte);
      }
    });

    if (cargo.incorporaCosto) {
      costo += BigInt(importe);
    } else {
      noCosto += BigInt(importe);
    }

    total = numeroSeguro(
      BigInt(total) + BigInt(importe)
    );

    calculados.push({
      ...cargo,
      montoMoneda: importe / 100
    });
  }

  return {
    subtotalProductosMoneda: subtotal / 100,
    totalCargosMoneda: numeroSeguro(costo + noCosto) / 100,
    cargosCostoMoneda: numeroSeguro(costo) / 100,
    cargosNoCostoMoneda: numeroSeguro(noCosto) / 100,
    totalMoneda: total / 100,
    cargos: calculados,

    detalles: lineas.map((linea) => ({
      productoId: linea.productoId,
      cantidad: linea.cantidad,
      costoUnitarioMoneda: linea.costoUnitarioMoneda,

      subtotalBaseMoneda: linea.base / 100,

      cargosCostoMoneda:
        numeroSeguro(linea.cargoCosto) / 100,

      cargosNoCostoMoneda:
        numeroSeguro(linea.cargoNoCosto) / 100,

      costoTotalMoneda:
        numeroSeguro(
          BigInt(linea.base) + linea.cargoCosto
        ) / 100,

      subtotalMoneda:
        numeroSeguro(
          BigInt(linea.base) +
            linea.cargoCosto +
            linea.cargoNoCosto
        ) / 100
    }))
  };
}