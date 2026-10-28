import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Gastos from "../models/dbGastos.js";
import Ventas from "../models/dbVentas.js";
import Caja from "../models/dbCaja.js";

import {
  comprobarAbierta,
  fallo
} from "./controlCaja.js";

import {
  tocarDias
} from "./transaccionCaja.js";

// COMPROBAR SI EL MES TIENE DOCUMENTOS CERRADOS
export async function comprobarMesHuevos(
  fecha,
  sede,
  session
) {
  const inicio = new Date(
    `${fecha.slice(0, 7)}-01T00:00:00.000Z`
  );

  const fin = new Date(inicio);
  fin.setUTCMonth(fin.getUTCMonth() + 1);

  const filtroSede = sede === "MONASTERIO"
    ? { sede: "MONASTERIO" }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

  const filtro = {
    fecha: {
      $gte: inicio,
      $lt: fin
    },
    cierre: "S",
    ...filtroSede
  };

  const modelos = [
    Entrada,
    Salida,
    Gastos,
    Ventas,
    Caja
  ];

  for (const Modelo of modelos) {
    const cerrado = await Modelo
      .findOne(filtro)
      .select("_id")
      .session(session)
      .lean();

    if (cerrado) {
      throw fallo(
        423,
        "Ese mes contiene documentos cerrados. " +
        "No puede cambiar sus movimientos."
      );
    }
  }
}

// COMPROBAR EL DÍA Y EL MES ANTES DE GUARDAR
export async function comprobarDiaHuevos(
  fecha,
  sede,
  session
) {
  await tocarDias(
    [{ fecha, sede }],
    session
  );

  await comprobarAbierta(
    fecha,
    sede,
    session
  );

  await comprobarMesHuevos(
    fecha,
    sede,
    session
  );
}