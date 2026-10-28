import {
  entero,
  sumarSeguro
} from "./calculoHuevos.mjs";

// FECHA COMERCIAL
export const dia = (valor) => {
  const texto = valor instanceof Date
    ? valor.toISOString().slice(0, 10)
    : String(valor || "").slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(texto) ||
    new Date(`${texto}T00:00:00.000Z`)
      .toISOString()
      .slice(0, 10) !== texto
  ) {
    throw new Error("Fecha inválida.");
  }

  return texto;
};

// CONVERTIR CARTONES VENDIDOS A HUEVOS
// 1 cartón = 30 huevos; 0,5 cartón = 15 huevos.
export function unidadesCartones(cantidad) {
  if (
    typeof cantidad !== "number" ||
    !Number.isFinite(cantidad) ||
    cantidad <= 0 ||
    !Number.isSafeInteger(cantidad * 2)
  ) {
    throw new Error(
      "Venda cartones completos o medios cartones."
    );
  }

  return entero(
    cantidad * 30,
    "Huevos vendidos",
    1
  );
}

// PREPARAR MOVIMIENTOS POR GRUPO
export function eventosHuevos(movimientos, vendidos) {
  const eventos = [];

  for (const movimiento of movimientos) {
    if (movimiento.tipo === "BAJA") continue;

    const base = {
      grupoId: String(movimiento.grupoId),
      fecha: dia(movimiento.fecha),
      referencia: String(movimiento._id)
    };

    eventos.push({
      ...base,
      sede: movimiento.sede,
      unidades: movimiento.tipo === "PRODUCCION"
        ? movimiento.unidades
        : -movimiento.unidades
    });

    if (
      movimiento.tipo === "ENVIO" &&
      movimiento.recepcion
    ) {
      eventos.push({
        ...base,
        sede: "TIENDITA",
        fecha: dia(movimiento.recepcion.fecha),
        unidades: movimiento.recepcion.recibidos
      });
    }
  }

  for (const vendido of vendidos) {
    if (!vendido.asignacionesHuevos?.length) continue;

    for (const asignacion of vendido.asignacionesHuevos) {
      if (!asignacion.grupoId) continue;

      eventos.push({
        grupoId: String(asignacion.grupoId),
        sede: vendido.sede || "TIENDITA",
        fecha: dia(vendido.fechaVentaHuevos),
        unidades: -asignacion.unidades,
        referencia: String(vendido._id)
      });
    }
  }

  for (const evento of eventos) {
    entero(Math.abs(evento.unidades), "Unidades");
  }

  return eventos.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      b.unidades - a.unidades ||
      a.referencia.localeCompare(b.referencia)
  );
}

// COMPROBAR QUE NO QUEDEN EXISTENCIAS NEGATIVAS
export function validarExistencias(eventos) {
  const saldos = new Map();

  for (const evento of eventos) {
    const clave =
      `${evento.sede}:${evento.grupoId}`;

    const saldo = sumarSeguro(
      saldos.get(clave) || 0,
      evento.unidades
    );

    if (saldo < 0) {
      throw new Error(
        "La operación deja existencias negativas en el grupo, " +
        "en esa fecha o en movimientos posteriores."
      );
    }

    saldos.set(clave, saldo);
  }

  return saldos;
}

// CANTIDAD QUE PUEDE RETIRARSE EN UNA FECHA
// También reserva los retiros posteriores ya registrados.
export function disponiblesDesde(
  eventos,
  sede,
  grupoId,
  fecha
) {
  const lista = eventos.filter(
    (evento) =>
      evento.sede === sede &&
      evento.grupoId === String(grupoId)
  );

  let saldo = 0;
  let disponible = null;

  for (const evento of lista) {
    saldo = sumarSeguro(saldo, evento.unidades);

    if (evento.fecha <= fecha) continue;

    disponible = Math.min(
      disponible ?? (saldo - evento.unidades),
      saldo
    );
  }

  const alDia = lista
    .filter((evento) => evento.fecha <= fecha)
    .reduce(
      (suma, evento) =>
        sumarSeguro(suma, evento.unidades),
      0
    );

  return Math.max(
    0,
    Math.min(alDia, disponible ?? alDia)
  );
}

// GALLINAS QUE PERMANECEN EN EL GRUPO
export function gallinasDisponibles(
  grupo,
  movimientos
) {
  const bajas = movimientos
    .filter(
      (movimiento) =>
        movimiento.tipo === "BAJA" &&
        String(movimiento.grupoId) === String(grupo._id)
    )
    .reduce(
      (suma, movimiento) =>
        sumarSeguro(
          suma,
          entero(movimiento.unidades, "Bajas", 1)
        ),
      0
    );

  const disponibles =
    entero(
      grupo.cantidadInicial,
      "Gallinas iniciales",
      1
    ) - bajas;

  if (disponibles < 0) {
    throw new Error(
      "Las bajas superan las gallinas del grupo."
    );
  }

  return disponibles;
}

// DISTRIBUIR UN RETIRO ENTRE GRUPOS DISPONIBLES
export function repartirHuevos(
  unidades,
  candidatos
) {
  entero(unidades, "Huevos", 1);

  let resto = unidades;
  const asignaciones = [];

  for (const candidato of candidatos) {
    entero(
      candidato.disponibles,
      "Disponibilidad"
    );

    const cantidad = Math.min(
      resto,
      candidato.disponibles
    );

    if (cantidad) {
      asignaciones.push({
        grupoId: candidato.grupoId || null,
        unidades: cantidad
      });
    }

    resto -= cantidad;

    if (!resto) break;
  }

  if (resto) {
    throw new Error(
      "No hay suficientes huevos disponibles."
    );
  }

  return asignaciones;
}

// AL CORREGIR UNA VENTA, CONSERVAR SU PROCEDENCIA
// ANTES DE ASIGNAR PRODUCCIÓN ADICIONAL.
export function repartirPreferente(
  unidades,
  candidatos,
  preferencias = []
) {
  entero(unidades, "Huevos", 1);

  const clave = (valor) =>
    valor ? String(valor) : "SIN_GRUPO";

  const disponibles = new Map();

  for (const candidato of candidatos) {
    const identificador = clave(candidato.grupoId);

    if (disponibles.has(identificador)) {
      throw new Error(
        "Grupo de disponibilidad repetido."
      );
    }

    disponibles.set(identificador, {
      grupoId: candidato.grupoId || null,
      unidades: entero(
        candidato.disponibles,
        "Disponibles"
      )
    });
  }

  const asignado = new Map();
  let resto = unidades;

  const tomar = (identificador, maximo) => {
    const candidato = disponibles.get(identificador);

    const cantidad = Math.min(
      resto,
      candidato?.unidades || 0,
      maximo
    );

    if (!cantidad) return 0;

    resto -= cantidad;
    candidato.unidades -= cantidad;

    asignado.set(identificador, {
      grupoId: candidato.grupoId,
      unidades:
        (asignado.get(identificador)?.unidades || 0) +
        cantidad
    });

    return cantidad;
  };

  const preferenciasRestantes = preferencias.map(
    (preferencia) => ({
      ...preferencia,
      unidades: entero(
        preferencia.unidades,
        "Preferencia"
      )
    })
  );

  for (const preferencia of preferenciasRestantes) {
    preferencia.unidades -= tomar(
      clave(preferencia.grupoId),
      preferencia.unidades
    );
  }

  for (const identificador of disponibles.keys()) {
    tomar(
      identificador,
      Number.MAX_SAFE_INTEGER
    );
  }

  if (resto) {
    throw new Error(
      "No hay suficientes huevos disponibles."
    );
  }

  return {
    asignaciones: [...asignado.values()],
    preferenciasRestantes
  };
}

// EVITAR PRODUCCIÓN DESPUÉS DE LA SALIDA
// DE TODAS LAS GALLINAS DEL GRUPO.
export function validarProduccionGallinas(
  grupo,
  movimientos
) {
  const idGrupo = String(grupo._id);

  const producciones = movimientos.filter(
    (movimiento) =>
      movimiento.tipo === "PRODUCCION" &&
      String(movimiento.grupoId) === idGrupo
  );

  for (const produccion of producciones) {
    const bajasAnteriores = movimientos
      .filter(
        (movimiento) =>
          movimiento.tipo === "BAJA" &&
          String(movimiento.grupoId) === idGrupo &&
          dia(movimiento.fecha) < dia(produccion.fecha)
      )
      .reduce(
        (suma, movimiento) =>
          sumarSeguro(suma, movimiento.unidades),
        0
      );

    if (bajasAnteriores >= grupo.cantidadInicial) {
      throw new Error(
        "Hay producción en una fecha posterior " +
        "a la salida de todas las gallinas."
      );
    }
  }
}