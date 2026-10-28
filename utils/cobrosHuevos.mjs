import { entero } from "./calculoHuevos.mjs";

// REPARTIR UN IMPORTE CONSERVANDO TODOS LOS CENTAVOS.
// Los pesos indican la proporción correspondiente a cada grupo.
export function repartirCentavos(total, pesos) {
  if (
    !Number.isSafeInteger(total) ||
    !pesos.length ||
    pesos.some(
      (peso) => !Number.isFinite(peso) || peso < 0
    )
  ) {
    throw new Error(
      "No se puede distribuir el cobro."
    );
  }

  const suma = pesos.reduce(
    (acumulado, peso) => acumulado + peso,
    0
  );

  if (!(suma > 0)) {
    throw new Error(
      "La factura no tiene una base válida para distribuir el cobro."
    );
  }

  const signo = total < 0 ? -1 : 1;

  const filas = pesos.map((peso, indice) => {
    const cuota = Math.abs(total) * (peso / suma);

    return {
      indice,
      entero: Math.floor(cuota),
      resto: cuota % 1
    };
  });

  const faltan =
    Math.abs(total) -
    filas.reduce(
      (acumulado, fila) =>
        acumulado + fila.entero,
      0
    );

  entero(faltan, "Resto de centavos");

  if (faltan > filas.length) {
    throw new Error(
      "No se pudo conservar el importe cobrado."
    );
  }

  const orden = [...filas].sort(
    (a, b) =>
      b.resto - a.resto ||
      a.indice - b.indice
  );

  for (let indice = 0; indice < faltan; indice++) {
    orden[indice].entero++;
  }

  return filas.map(
    (fila) => fila.entero * signo
  );
}

// CALCULAR COBROS POR GRUPO DE GALLINAS.
// Incluye ventas, abonos y vueltos.
// Cada moneda se conserva por separado.
export function cobrosPorGrupoHuevos(
  movimientos,
  lineas
) {
  const resultado = new Map();
  const avisos = [];
  const porFactura = new Map();

  // Separar facturas por sede para evitar mezclar números iguales.
  for (const linea of lineas) {
    const clave =
      `${linea.sede || "TIENDITA"}:${linea.factura}`;

    const lista = porFactura.get(clave) || [];

    lista.push(linea);
    porFactura.set(clave, lista);
  }

  for (const movimiento of movimientos) {
    const operacion = String(
      movimiento.operacion || ""
    )
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();

    if (
      !/^(VENTA|ABONO(?: DE CREDITO)?|VUELTOS?)$/.test(
        operacion
      )
    ) {
      continue;
    }

    const clave =
      `${movimiento.sede || "TIENDITA"}:` +
      `${movimiento.factura}`;

    const renglones = porFactura.get(clave) || [];

    const tieneGrupo = renglones.some(
      (linea) =>
        linea.asignacionesHuevos?.some(
          (asignacion) => asignacion.grupoId
        )
    );

    if (!tieneGrupo) continue;

    const pesos = new Map();
    let resto = 0;

    for (const linea of renglones) {
      if (
        !Number.isFinite(linea.total) ||
        linea.total < 0
      ) {
        throw new Error(
          "Hay un importe inválido en el detalle de una factura."
        );
      }

      // Otros productos o huevos sin grupo histórico.
      if (!linea.asignacionesHuevos?.length) {
        resto += linea.total;
        continue;
      }

      const totalUnidades =
        linea.asignacionesHuevos.reduce(
          (acumulado, asignacion) =>
            acumulado + asignacion.unidades,
          0
        );

      if (
        !Number.isSafeInteger(totalUnidades) ||
        totalUnidades <= 0 ||
        totalUnidades !== linea.huevosUnidades
      ) {
        throw new Error(
          "La asignación de huevos de una venta necesita revisión."
        );
      }

      for (const asignacion of linea.asignacionesHuevos) {
        const valor =
          linea.total *
          asignacion.unidades /
          totalUnidades;

        if (!asignacion.grupoId) {
          resto += valor;
        } else {
          const grupoId = String(
            asignacion.grupoId
          );

          pesos.set(
            grupoId,
            (pesos.get(grupoId) || 0) + valor
          );
        }
      }
    }

    const ids = [...pesos.keys()];
    const valores = [...pesos.values(), resto];

    if (!valores.some((valor) => valor > 0)) {
      avisos.push(
        `Factura ${clave}: sin base para repartir su cobro.`
      );

      continue;
    }

    // Convertir los importes a centavos.
    const importe = (campos) =>
      campos.reduce((acumulado, campo) => {
        const valor = movimiento[campo] ?? 0;

        if (
          typeof valor !== "number" ||
          !Number.isFinite(valor)
        ) {
          throw new Error(
            "Hay un importe de moneda inválido."
          );
        }

        return (
          acumulado + Math.round(valor * 100)
        );
      }, 0);

    const cobro = {
      D: importe([
        "efectivoD",
        "zelle"
      ]),
      P: importe([
        "efectivoP",
        "transferenciaP"
      ]),
      Bs: importe([
        "efectivoBs",
        "transferenciaBs",
        "puntoBs",
        "pagomovilBs"
      ])
    };

    for (const moneda of ["D", "P", "Bs"]) {
      const partes = repartirCentavos(
        cobro[moneda],
        valores
      );

      ids.forEach((grupoId, indice) => {
        const totales = resultado.get(grupoId) || {
          D: 0,
          P: 0,
          Bs: 0
        };

        totales[moneda] += partes[indice];

        resultado.set(grupoId, totales);
      });
    }
  }

  return {
    resultado,
    avisos
  };
}