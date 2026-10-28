import mongoose from "mongoose";
import { createHash } from "node:crypto";
import LoteCrianza from "../models/LoteCrianza.js";
import ConsumoLote from "../models/ConsumoLote.js";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Producto from "../models/Producto.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";
import {
  comprobarAcceso,
  comprobarAbierta,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  calcularSaldoConsumoLote
} from "../utils/saldoConsumoLote.js";

const DESTINOS = [
  {
    codigo: "COCINA_MONASTERIO",
    nombre: "Cocina del Monasterio"
  },
  {
    codigo: "PASAPALOS",
    nombre: "Pasapalos para consumo interno"
  },
  {
    codigo: "CELEBRACION",
    nombre: "Celebración"
  },
  {
    codigo: "OTRO",
    nombre: "Otro destino"
  }
];

function hoy() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const parte = (tipo) =>
    partes.find((item) => item.type === tipo).value;

  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function validarId(id) {
  if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
    throw fallo(400, "El lote no es válido.");
  }
}

function fechaValida(valor) {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    throw fallo(400, "Seleccione una fecha válida.");
  }

  const dia = diaComercial(valor);

  if (dia > hoy()) {
    throw fallo(400, "No puede registrar consumo futuro.");
  }

  return dia;
}

function numero(valor) {
  return typeof valor === "number" ||
    (
      typeof valor === "string" &&
      valor.trim() !== ""
    )
      ? Number(valor)
      : NaN;
}

function responderError(res, error) {
  console.error("Error en consumo del lote:", error);

  return res.status(error.estado || 500).json({
    ok: false,
    mensaje: error.estado
      ? error.message
      : "No se pudo confirmar la operación. Conserve la solicitud para reintentar."
  });
}

function filtroSede(sede) {
  return sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };
}

async function cargarSaldo(loteId, sede, dia, session) {
  const fin = new Date(`${dia}T00:00:00.000Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);

  const ingresos = await Entrada.find({
    loteId,
    ...filtroSede(sede),
    fecha: { $lt: fin }
  })
    .select("productoId")
    .session(session)
    .lean();

  const ids = [...new Set(
    ingresos.map((item) => String(item.productoId))
  )];

  if (ids.length === 0) return [];

  const filtro = {
    ...filtroSede(sede),
    productoId: { $in: ids }
  };

  const productos = await Producto.find({
    _id: { $in: ids },
    ...filtroSede(sede)
  })
    .select("codigo descripcion stock sede")
    .session(session)
    .lean();

  const entradas = await Entrada.find({
    ...filtro,
    fecha: { $lt: fin }
  }).session(session).lean();

  const salidas = await Salida.find(filtro)
    .session(session)
    .lean();

  const vendidos = await Vendidos.find(filtro)
    .session(session)
    .lean();

  const facturas = [...new Set(
    vendidos.map((item) => item.factura)
  )];

  const ventas = facturas.length
    ? await Ventas.find({
        ...filtroSede(sede),
        factura: { $in: facturas }
      })
        .select("factura fecha sede")
        .session(session)
        .lean()
    : [];

  return calcularSaldoConsumoLote({
    loteId,
    sede,
    productos,
    entradas,
    salidas,
    vendidos,
    ventas
  });
}

// =====================================================
// CONSULTAR EXISTENCIAS E HISTORIAL
// =====================================================
export async function obtenerConsumoLote(req, res) {
  let session;

  try {
    const { id } = req.params;
    validarId(id);

    const sede = req.query.sede || "MONASTERIO";

    comprobarAcceso(req, "MONASTERIO");
    comprobarAcceso(req, sede);

    const dia = fechaValida(req.query.fecha || hoy());

    session = await mongoose.startSession();

    let resultado;

    await session.withTransaction(async () => {
      const lote = await LoteCrianza.findOne({
        _id: id,
        sede: "MONASTERIO",
        especie: "POLLOS"
      }).session(session).lean();

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      if (dia < diaComercial(lote.fechaInicio)) {
        throw fallo(
          400,
          "La fecha es anterior al inicio del lote."
        );
      }

      const productos = await cargarSaldo(
        lote._id,
        sede,
        dia,
        session
      );

      const consumos = await ConsumoLote.find({
        loteId: lote._id,
        sede
      })
        .sort({ fecha: -1, _id: -1 })
        .session(session)
        .lean();

      resultado = {
        lote: {
          _id: lote._id,
          nombre: lote.nombre,
          fechaInicio: lote.fechaInicio
        },
        sede,
        fecha: dia,
        productos,
        consumos,
        destinos: DESTINOS
      };
    });

    return res.json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    return responderError(res, error);
  } finally {
    if (session) await session.endSession();
  }
}

function normalizarDetalles(detalles) {
  if (
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    detalles.length > 7
  ) {
    throw fallo(
      400,
      "Seleccione entre uno y siete productos para consumo."
    );
  }

  const ids = new Set();

  return detalles.map((detalle) => {
    if (!detalle || typeof detalle !== "object") {
      throw fallo(400, "El detalle no es válido.");
    }

    const productoId = String(
      detalle.productoId || ""
    ).toLowerCase();

    if (
      !/^[a-f0-9]{24}$/.test(productoId) ||
      ids.has(productoId)
    ) {
      throw fallo(
        400,
        "Seleccione productos válidos sin repetirlos."
      );
    }

    ids.add(productoId);

    const peso = numero(detalle.pesoKg);
    const gramos = Math.round(peso * 1000);

    if (
      !Number.isFinite(peso) ||
      peso <= 0 ||
      !Number.isSafeInteger(gramos) ||
      gramos <= 0 ||
      Math.abs(peso * 1000 - gramos) >= 0.000001
    ) {
      throw fallo(
        400,
        "Indique kilos mayores que cero y hasta tres decimales."
      );
    }

    const valor = detalle.cantidadPresentaciones;

    const cantidadPresentaciones =
      valor === null ||
      valor === undefined ||
      valor === ""
        ? null
        : numero(valor);

    if (
      cantidadPresentaciones !== null &&
      (
        !Number.isSafeInteger(cantidadPresentaciones) ||
        cantidadPresentaciones <= 0
      )
    ) {
      throw fallo(
        400,
        "Las piezas o paquetes deben ser enteros mayores que cero."
      );
    }

    return {
      productoId,
      pesoKg: gramos / 1000,
      cantidadPresentaciones
    };
  }).sort((a, b) =>
    a.productoId.localeCompare(b.productoId)
  );
}

function firmaConsumo(datos) {
  return JSON.stringify({
    fecha: diaComercial(datos.fecha),
    sede: datos.sede,
    destino: datos.destino,
    observaciones: datos.observaciones || "",
    detalles: normalizarDetalles(datos.detalles)
  });
}

// =====================================================
// GUARDAR CONSUMO Y SUS SALIDAS
// =====================================================
export async function registrarConsumoLote(req, res) {
  let session;

  try {
    const { id } = req.params;
    validarId(id);

    const datos = req.body || {};

    comprobarAcceso(req, "MONASTERIO");
    comprobarAcceso(req, datos.sede);

    const dia = fechaValida(datos.fecha);

    const observaciones =
      typeof datos.observaciones === "string"
        ? datos.observaciones.trim()
        : "";

    if (
      !DESTINOS.some(
        (item) => item.codigo === datos.destino
      ) ||
      observaciones.length > 2000 ||
      (datos.destino === "OTRO" && !observaciones)
    ) {
      throw fallo(
        400,
        "Revise el destino y las observaciones del consumo."
      );
    }

    if (
      typeof datos.claveOperacion !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(datos.claveOperacion)
    ) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const solicitud = {
      fecha: new Date(`${dia}T00:00:00.000Z`),
      sede: datos.sede,
      destino: datos.destino,
      observaciones,
      detalles: normalizarDetalles(datos.detalles)
    };

    const consumoId = new mongoose.Types.ObjectId(
      createHash("sha256")
        .update(
          `consumo-lote:${id.toLowerCase()}:` +
          `${req.usuarioCaja._id}:${datos.claveOperacion}`
        )
        .digest("hex")
        .slice(0, 24)
    );

    session = await mongoose.startSession();

    let guardado;
    let repetida = false;

    await session.withTransaction(async () => {
      repetida = false;

      const lote = await LoteCrianza.findOneAndUpdate(
        {
          _id: id,
          sede: "MONASTERIO",
          especie: "POLLOS"
        },
        {
          $inc: { __v: 1 }
        },
        {
          returnDocument: "after",
          session
        }
      );

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      if (dia < diaComercial(lote.fechaInicio)) {
        throw fallo(
          400,
          "La fecha es anterior al inicio del lote."
        );
      }

      const anterior = await ConsumoLote.findById(
        consumoId
      ).session(session);

      if (anterior) {
        if (
          firmaConsumo(anterior) !==
          firmaConsumo(solicitud)
        ) {
          throw fallo(
            409,
            "El identificador ya fue utilizado con otros datos."
          );
        }

        guardado = anterior;
        repetida = true;
        return;
      }

      const alcances = [];

      for (
        let cursor = new Date(lote.fechaInicio);
        diaComercial(cursor) <= hoy();
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        alcances.push({
          fecha: diaComercial(cursor),
          sede: solicitud.sede
        });
      }

      await tocarDias(alcances, session);

      await comprobarAbierta(
        dia,
        solicitud.sede,
        session
      );

      const inicioMes = new Date(
        `${dia.slice(0, 7)}-01T00:00:00.000Z`
      );

      const finMes = new Date(inicioMes);
      finMes.setUTCMonth(finMes.getUTCMonth() + 1);

      const periodo = {
        ...filtroSede(solicitud.sede),
        cierre: "S",
        fecha: {
          $gte: inicioMes,
          $lt: finMes
        }
      };

      if (
        await Salida.exists(periodo).session(session) ||
        await Entrada.exists(periodo).session(session)
      ) {
        throw fallo(
          409,
          "El período tiene movimientos cerrados. No se puede agregar consumo."
        );
      }

      const disponibles = await cargarSaldo(
        lote._id,
        solicitud.sede,
        dia,
        session
      );

      const detallesGuardados = [];
      const salidas = [];

      for (const detalle of solicitud.detalles) {
        const saldo = disponibles.find(
          (item) => item.productoId === detalle.productoId
        );

        if (!saldo || !saldo.habilitado) {
          throw fallo(
            409,
            saldo?.bloqueos?.join(" ") ||
            "El producto no tiene existencias disponibles del lote."
          );
        }

        const retirado = Math.round(
          detalle.pesoKg * 1000
        );

        const existente = Math.round(
          saldo.disponibleKg * 1000
        );

        if (retirado > existente) {
          throw fallo(
            409,
            `El peso supera lo disponible de ${saldo.descripcion}.`
          );
        }

        if (saldo.presentacion === "SOLO_PESO") {
          if (detalle.cantidadPresentaciones !== null) {
            throw fallo(
              400,
              "Este producto se retira únicamente por kilos."
            );
          }
        } else {
          const cantidad = detalle.cantidadPresentaciones;

          if (
            !Number.isSafeInteger(cantidad) ||
            cantidad <= 0 ||
            cantidad > saldo.presentacionesDisponibles
          ) {
            throw fallo(
              409,
              `Revise las piezas o paquetes de ${saldo.descripcion}.`
            );
          }

          if (
            (retirado === existente) !==
            (cantidad === saldo.presentacionesDisponibles)
          ) {
            throw fallo(
              409,
              `Los kilos y las piezas o paquetes restantes de ${saldo.descripcion} no coinciden. Revise el retiro.`
            );
          }
        }

        const productoActual = await Producto.findById(
          detalle.productoId
        )
          .select("categoria")
          .session(session);

        if (!productoActual) {
          throw fallo(
            409,
            "El producto ya no está disponible."
          );
        }

        const salidaId = new mongoose.Types.ObjectId();

        detallesGuardados.push({
          ...detalle,
          codigo: saldo.codigo,
          descripcion: saldo.descripcion,
          presentacion: saldo.presentacion,
          salidaId
        });

        salidas.push({
          _id: salidaId,
          fecha: solicitud.fecha,
          categoria: productoActual.categoria,
          productoId: detalle.productoId,
          codigo: saldo.codigo,
          cantidad: detalle.pesoKg,
          observacion: "CONSUMO INTERNO DEL LOTE",
          sede: solicitud.sede,
          cierre: "N",
          loteId: lote._id,
          consumoId,
          presentacionProduccion: saldo.presentacion,
          cantidadPresentaciones:
            detalle.cantidadPresentaciones
        });
      }

      const registros = await ConsumoLote.create(
        [
          {
            _id: consumoId,
            loteId: lote._id,
            ...solicitud,
            detalles: detallesGuardados,
            registradoPor: req.usuarioCaja._id,
            claveOperacion: datos.claveOperacion
          }
        ],
        {
          session,
          ordered: true
        }
      );

      await Salida.create(salidas, {
        session,
        ordered: true
      });

      guardado = registros[0];
    });

    return res.status(repetida ? 200 : 201).json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Este consumo ya estaba registrado."
        : "Consumo y salidas registrados correctamente.",
      consumo: guardado
    });
  } catch (error) {
    return responderError(res, error);
  } finally {
    if (session) await session.endSession();
  }
}

export {
  cargarSaldo as consultarSaldoLote,
  normalizarDetalles as normalizarDetalleRetiroLote,
  fechaValida as validarFechaMovimientoLote
};