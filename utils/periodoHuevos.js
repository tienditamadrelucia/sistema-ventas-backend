import mongoose from "mongoose";

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

export async function comprobarMesHuevos(
  d,
  sede,
  session
) {
  const instanteStock = new Date(
    `${d}T00:00:00.000Z`
  );

  const aperturaStock = await mongoose.connection.db
    .collection("aperturasStockInventario")
    .findOne(
      {
        sede,

        fechaOrigen: {
          $lte: instanteStock
        },

        fechaBase: {
          $gt: instanteStock
        }
      },
      {
        session: session || undefined
      }
    );

  if (aperturaStock) {
    throw fallo(
      423,
      "Ese período ya fue trasladado a la " +
      "apertura siguiente. La corrección " +
      "requiere conciliar la apertura."
    );
  }

  const inicio = new Date(
    `${d.slice(0, 7)}-01T00:00:00.000Z`
  );

  const fin = new Date(inicio);
  fin.setUTCMonth(fin.getUTCMonth() + 1);

  const filtro = {
    fecha: {
      $gte: inicio,
      $lt: fin
    },

    cierre: "S",

    ...(
      sede === "MONASTERIO"
        ? { sede }
        : {
            $or: [
              { sede },
              { sede: { $exists: false } }
            ]
          }
    )
  };

  for (
    const Modelo of [
      Entrada,
      Salida,
      Gastos,
      Ventas,
      Caja
    ]
  ) {
    const cerrado = await Modelo.findOne(filtro)
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

export async function comprobarDiaHuevos(
  d,
  sede,
  session
) {
  await tocarDias(
    [
      {
        fecha: d,
        sede
      }
    ],
    session
  );

  await comprobarAbierta(
    d,
    sede,
    session
  );

  await comprobarMesHuevos(
    d,
    sede,
    session
  );
}