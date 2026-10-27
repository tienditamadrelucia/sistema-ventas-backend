import mongoose from "mongoose";
import LoteCrianza from "../models/LoteCrianza.js";
import BajaCrianza from "../models/BajaCrianza.js";
import ProduccionPollo from "../models/ProduccionPollo.js";
import Entrada from "../models/Entrada.js";
import Producto from "../models/Producto.js";
import {
  comprobarAbierta,
  comprobarAcceso,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";
import { tocarDias } from "../utils/transaccionCaja.js";
import {
  exigirControlProduccion
} from "../utils/controlProduccionPollo.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";

import {
  consultarCambioProduccion,
  guardarCambioProduccion
} from "../utils/historialProduccionPollo.js";

const presentaciones = {
  PECHUGA: "PIEZA",
  MUSLOS: "PAQUETE_DOS",
  ALAS: "SOLO_PESO",
  PATAS: "SOLO_PESO",
  POLLO_ENTERO: "PIEZA",
  MILANESA: "SOLO_PESO",
  CHURRASCO: "SOLO_PESO"
};

function hoyVenezuela() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const obtener = (tipo) =>
    partes.find((parte) => parte.type === tipo).value;

  return (
    `${obtener("year")}-` +
    `${obtener("month")}-` +
    obtener("day")
  );
}

function numero(valor) {
  return (
    typeof valor === "number" ||
    (
      typeof valor === "string" &&
      valor.trim() !== ""
    )
  )
    ? Number(valor)
    : NaN;
}

function normalizarDetalles(detalles) {
  if (
    !Array.isArray(detalles) ||
    detalles.length === 0 ||
    detalles.length > 7
  ) {
    throw fallo(
      400,
      "Registre entre uno y siete productos obtenidos."
    );
  }

  const productos = new Set();
  const tipos = new Set();

  const resultado = detalles.map((detalle) => {
    if (!detalle || typeof detalle !== "object") {
      throw fallo(400, "El detalle de producción no es válido.");
    }

    const productoId =
      String(detalle.productoId || "").toLowerCase();

    const tipoProducto = detalle.tipoProducto;

    if (
      !/^[a-f0-9]{24}$/.test(productoId) ||
      !Object.prototype.hasOwnProperty.call(
        presentaciones,
        tipoProducto
      )
    ) {
      throw fallo(
        400,
        "Seleccione un producto y un tipo válidos."
      );
    }

    if (
      productos.has(productoId) ||
      tipos.has(tipoProducto)
    ) {
      throw fallo(
        400,
        "No puede repetir productos ni tipos en la jornada."
      );
    }

    productos.add(productoId);
    tipos.add(tipoProducto);

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
        "Cada peso debe ser mayor que cero y tener como máximo tres decimales."
      );
    }

    const presentacion = presentaciones[tipoProducto];

    const cantidadPresentaciones =
      presentacion === "SOLO_PESO"
        ? null
        : numero(detalle.cantidadPresentaciones);

    if (
      presentacion !== "SOLO_PESO" &&
      (
        !Number.isSafeInteger(cantidadPresentaciones) ||
        cantidadPresentaciones <= 0
      )
    ) {
      throw fallo(
        400,
        "Indique una cantidad entera de piezas o paquetes."
      );
    }

    return {
      productoId,
      tipoProducto,
      pesoKg: gramos / 1000,
      presentacion,
      cantidadPresentaciones,

      ...(tipoProducto === "MILANESA" &&
        detalle.pechugasUtilizadas !== undefined
        ? {
            pechugasUtilizadas:
              numero(detalle.pechugasUtilizadas)
          }
        : {}),

      ...(tipoProducto === "CHURRASCO" &&
        detalle.muslosUtilizados !== undefined
        ? {
            muslosUtilizados:
              numero(detalle.muslosUtilizados)
          }
        : {})
    };
  });

  return resultado.sort((a, b) =>
    a.productoId.localeCompare(b.productoId)
  );
}

function firma(datos) {
  return JSON.stringify({
    fecha: diaComercial(datos.fecha),
    pollosProcesados: datos.pollosProcesados,
    observaciones: datos.observaciones || "",
    detalles: normalizarDetalles(datos.detalles),

    control: datos.versionControl === 1
      ? {
          pesoControlKg: numero(datos.pesoControlKg),
          mermasKg: numero(datos.mermasKg)
        }
      : null
  });
}

// =====================================================
// GUARDAR JORNADA Y SUS ENTRADAS
// =====================================================
export async function registrarProduccionPollo(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id } = req.params;
    const datos = req.body || {};

    if (!/^[a-fA-F0-9]{24}$/.test(id || "")) {
      throw fallo(400, "El lote indicado no es válido.");
    }

    if (
      typeof datos.fecha !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)
    ) {
      throw fallo(400, "Seleccione una fecha válida.");
    }

    const dia = diaComercial(datos.fecha);
    const fecha = new Date(`${dia}T00:00:00.000Z`);

    if (dia > hoyVenezuela()) {
      throw fallo(400, "No puede registrar producción futura.");
    }

    const pollosProcesados = numero(
      datos.pollosProcesados
    );

    if (
      !Number.isSafeInteger(pollosProcesados) ||
      pollosProcesados <= 0
    ) {
      throw fallo(
        400,
        "Indique una cantidad entera de pollos procesados."
      );
    }

    const observaciones =
      typeof datos.observaciones === "string"
        ? datos.observaciones.trim()
        : "";

    if (observaciones.length > 2000) {
      throw fallo(400, "Las observaciones son demasiado largas.");
    }

    const claveOperacion =
      typeof datos.claveOperacion === "string"
        ? datos.claveOperacion.trim()
        : "";

    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(claveOperacion)) {
      throw fallo(
        400,
        "La solicitud no tiene un identificador válido."
      );
    }

    const detalles = normalizarDetalles(datos.detalles);

    const solicitud = {
  fecha,
  pollosProcesados,
  observaciones,
  detalles,
  pesoControlKg: datos.pesoControlKg,
  mermasKg: datos.mermasKg,

  versionControl:
    datos.pesoControlKg !== undefined ||
    datos.mermasKg !== undefined
      ? 1
      : undefined
};

    session = await mongoose.startSession();

    let produccionGuardada;
    let repetida = false;

    await session.withTransaction(async () => {
      repetida = false;

      // Coordina bajas, producción y eliminación del lote.
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
          new: true,
          session
        }
      );

      if (!lote) {
        throw fallo(404, "El lote no existe.");
      }

      if (dia < diaComercial(lote.fechaInicio)) {
        throw fallo(
          400,
          "La producción no puede ser anterior al inicio del lote."
        );
      }

      const anterior = await ProduccionPollo.findOne({
        loteId: lote._id,
        claveOperacion
      }).session(session);

      if (anterior) {
        if (
          String(anterior.registradoPor) !==
            String(req.usuarioCaja._id) ||
          firma(anterior) !== firma(solicitud)
        ) {
          throw fallo(
            409,
            "El identificador ya fue utilizado con otros datos."
          );
        }

        produccionGuardada = anterior;
        repetida = true;
        return;
      }

      const controlProduccion =
        exigirControlProduccion(solicitud);

      await tocarDias(
        [{ fecha: dia, sede: "MONASTERIO" }],
        session
      );

      await comprobarAbierta(
        dia,
        "MONASTERIO",
        session
      );

      const inicioMes = new Date(
        `${dia.slice(0, 7)}-01T00:00:00.000Z`
      );

      const finMes = new Date(inicioMes);
      finMes.setUTCMonth(finMes.getUTCMonth() + 1);

      const tieneEntradasCerradas = await Entrada.exists({
        sede: "MONASTERIO",
        fecha: {
          $gte: inicioMes,
          $lt: finMes
        },
        cierre: "S"
      }).session(session);

      if (tieneEntradasCerradas) {
        throw fallo(
          409,
          "El mes tiene entradas cerradas. No se puede agregar producción."
        );
      }

      const bajas = await BajaCrianza.find({
        loteId: lote._id
      })
        .select("cantidad")
        .session(session)
        .lean();

      const jornadas = await ProduccionPollo.find({
        loteId: lote._id
      })
        .select("pollosProcesados")
        .session(session)
        .lean();

      const totalBajas = bajas.reduce(
        (suma, baja) => suma + baja.cantidad,
        0
      );

      const totalProcesados = jornadas.reduce(
        (suma, jornada) => suma + jornada.pollosProcesados,
        0
      );

      const disponibles =
        lote.cantidadInicial -
        totalBajas -
        totalProcesados;

      if (pollosProcesados > disponibles) {
        throw fallo(
          409,
          `Sólo quedan ${disponibles} pollos disponibles en crianza.`
        );
      }

      const produccionId = new mongoose.Types.ObjectId();
      const detallesGuardados = [];
      const entradas = [];

      for (const detalle of detalles) {
        const producto = await Producto.findOne({
          _id: detalle.productoId,
          sede: "MONASTERIO"
        }).session(session);

        if (!producto) {
          throw fallo(
            400,
            "Uno de los productos no pertenece al Monasterio."
          );
        }

        if (producto.origen !== "PRODUCCION_MONASTERIO") {
          throw fallo(
            400,
            `El producto ${producto.descripcion} debe tener origen PRODUCCIÓN DEL MONASTERIO.`
          );
        }

        if (
          !producto.descripcion ||
          !Number.isFinite(producto.codigo)
        ) {
          throw fallo(
            400,
            "Uno de los productos no tiene código o descripción válidos."
          );
        }

        const entradaId = new mongoose.Types.ObjectId();

        detallesGuardados.push({
          ...detalle,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          entradaId
        });

        entradas.push({
          _id: entradaId,
          fecha,
          categoria: producto.categoria,
          productoId: producto._id,
          codigo: producto.codigo,

          // El inventario se mueve en kilos.
          cantidad: detalle.pesoKg,

          observacion: "PRODUCCIÓN DEL MONASTERIO",
          sede: "MONASTERIO",
          cierre: "N",
          loteId: lote._id,
          produccionId,
          presentacionProduccion: detalle.presentacion,
          cantidadPresentaciones:
            detalle.cantidadPresentaciones
        });
      }

      const registros = await ProduccionPollo.create(
        [
          {
            _id: produccionId,
            loteId: lote._id,
            sede: "MONASTERIO",
            fecha,
            pollosProcesados,
            detalles: detallesGuardados,
            pesoControlKg: controlProduccion.peso.controlKg,
            mermasKg: controlProduccion.peso.mermasKg,
            versionControl: 1,
            observaciones,
            registradoPor: req.usuarioCaja._id,
            claveOperacion
          }
        ],
        { session }
      );

      await Entrada.create(entradas, {
        session,
        ordered: true
      });

      produccionGuardada = registros[0];
    });

    return res.status(repetida ? 200 : 201).json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "Esta producción ya estaba registrada."
        : "Producción y entradas registradas correctamente.",
      produccion: produccionGuardada
    });
  } catch (error) {
    console.error("Error registrando producción:", error);

    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo confirmar la producción. Reintente conservando la misma solicitud."
    });
  } finally {
    if (session) await session.endSession();
  }
}

// =====================================================
// MODIFICAR UNA JORNADA Y SUS ENTRADAS
// =====================================================
export async function modificarProduccionPollo(req, res) {
  let session;

  try {
    comprobarAcceso(req, "MONASTERIO");

    const { id, produccionId } = req.params;
    const datos = req.body || {};

    if (
      ![id, produccionId].every(
        (valor) => /^[a-fA-F0-9]{24}$/.test(valor || "")
      )
    ) {
      throw fallo(400, "El lote o la jornada no son válidos.");
    }

    const versionEsperada = numero(datos.versionEsperada);

    if (
      !Number.isSafeInteger(versionEsperada) ||
      versionEsperada < 0
    ) {
      throw fallo(
        400,
        "Actualice la jornada antes de modificarla."
      );
    }

    if (
      typeof datos.fecha !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)
    ) {
      throw fallo(400, "Seleccione una fecha válida.");
    }

    const dia = diaComercial(datos.fecha);

    if (dia > hoyVenezuela()) {
      throw fallo(400, "La fecha no puede ser futura.");
    }

    const valores = {
      fecha: new Date(`${dia}T00:00:00.000Z`),
      pollosProcesados: numero(datos.pollosProcesados),
      observaciones:
        typeof datos.observaciones === "string"
          ? datos.observaciones.trim()
          : "",
      detalles: normalizarDetalles(datos.detalles),
      pesoControlKg: datos.pesoControlKg,
      mermasKg: datos.mermasKg,
      versionControl: 1
    };

    if (valores.observaciones.length > 2000) {
      throw fallo(
        400,
        "Las observaciones son demasiado largas."
      );
    }

    const control = exigirControlProduccion(valores);

    valores.pesoControlKg = control.peso.controlKg;
    valores.mermasKg = control.peso.mermasKg;

    const identidad = {
      loteId: id,
      usuarioId: req.usuarioCaja._id,
      claveOperacion: datos.claveOperacion
    };

    const firmaSolicitud = JSON.stringify({
      accion: "MODIFICAR",
      produccionId: produccionId.toLowerCase(),
      versionEsperada,
      contenido: firma(valores)
    });

    session = await mongoose.startSession();

    let guardada;
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

      const cambio = await consultarCambioProduccion(
        identidad,
        session
      );

      if (cambio) {
        if (cambio.firmaSolicitud !== firmaSolicitud) {
          throw fallo(
            409,
            "El identificador ya fue utilizado con otros datos."
          );
        }

        guardada = cambio.despues;
        repetida = true;
        return;
      }

      const jornada = await ProduccionPollo.findOne({
        _id: produccionId,
        loteId: lote._id,
        sede: "MONASTERIO"
      }).session(session);

      if (!jornada) {
        throw fallo(404, "La jornada no existe.");
      }

      if ((jornada.__v ?? 0) !== versionEsperada) {
        throw fallo(
          409,
          "La jornada cambió. Vuelva a abrirla antes de corregirla."
        );
      }

      if (dia < diaComercial(lote.fechaInicio)) {
        throw fallo(
          400,
          "La fecha no puede ser anterior al inicio del lote."
        );
      }

      const antes = jornada.toObject();
      const diaAnterior = diaComercial(jornada.fecha);
      const primerDia = dia < diaAnterior
        ? dia
        : diaAnterior;

      const inicio = new Date(
        `${primerDia}T00:00:00.000Z`
      );

      const alcances = [];

      for (
        let cursor = new Date(inicio);
        diaComercial(cursor) <= hoyVenezuela();
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        alcances.push({
          fecha: diaComercial(cursor),
          sede: "MONASTERIO"
        });
      }

      await tocarDias(alcances, session);

      for (
        const fechaRevision of new Set([diaAnterior, dia])
      ) {
        await comprobarAbierta(
          fechaRevision,
          "MONASTERIO",
          session
        );

        const inicioMes = new Date(
          `${fechaRevision.slice(0, 7)}-01T00:00:00.000Z`
        );

        const finMes = new Date(inicioMes);
        finMes.setUTCMonth(finMes.getUTCMonth() + 1);

        const mesCerrado = await Entrada.exists({
          sede: "MONASTERIO",
          cierre: "S",
          fecha: {
            $gte: inicioMes,
            $lt: finMes
          }
        }).session(session);

        if (mesCerrado) {
          throw fallo(
            409,
            "No puede corregir producción de un mes con entradas cerradas."
          );
        }
      }

      const idsProductos = [...new Set([
        ...jornada.detalles.map(
          (detalle) => String(detalle.productoId)
        ),
        ...valores.detalles.map(
          (detalle) => detalle.productoId
        )
      ])];

      const salida = await Salida.exists({
        sede: "MONASTERIO",
        productoId: { $in: idsProductos },
        $or: [
          { fecha: { $gte: inicio } },
          { createdAt: { $gte: inicio } }
        ]
      }).session(session);

      const ventaRegistrada = await Vendidos.exists({
        sede: "MONASTERIO",
        productoId: { $in: idsProductos },
        createdAt: { $gte: inicio }
      }).session(session);

      const facturas = await Ventas.find({
        sede: "MONASTERIO",
        fecha: { $gte: inicio }
      })
        .select("factura")
        .session(session)
        .lean();

      const ventaFechada =
        facturas.length > 0 &&
        await Vendidos.exists({
          sede: "MONASTERIO",
          productoId: { $in: idsProductos },
          factura: {
            $in: facturas.map((venta) => venta.factura)
          }
        }).session(session);

      if (salida || ventaRegistrada || ventaFechada) {
        throw fallo(
          409,
          "Hay ventas o salidas posteriores de estos productos. La corrección requiere revisar esos movimientos primero."
        );
      }

      const entradas = await Entrada.find({
        $or: [
          { produccionId: jornada._id },
          {
            _id: {
              $in: jornada.detalles.map(
                (detalle) => detalle.entradaId
              )
            }
          }
        ]
      }).session(session);

      if (entradas.length !== jornada.detalles.length) {
        throw fallo(
          409,
          "Las entradas vinculadas requieren revisión."
        );
      }

      const entradasPorProducto = new Map();

      for (const detalle of jornada.detalles) {
        const entrada = entradas.find(
          (item) =>
            String(item._id) === String(detalle.entradaId)
        );

        if (
          !entrada ||
          entrada.cierre === "S" ||
          entrada.sede !== "MONASTERIO" ||
          String(entrada.loteId) !== String(lote._id) ||
          String(entrada.produccionId) !== String(jornada._id) ||
          String(entrada.productoId) !== String(detalle.productoId) ||
          diaComercial(entrada.fecha) !== diaAnterior ||
          Math.abs(
            Number(entrada.cantidad) - detalle.pesoKg
          ) > 0.0000001 ||
          entradasPorProducto.has(
            String(detalle.productoId)
          )
        ) {
          throw fallo(
            409,
            "Una entrada vinculada cambió o está cerrada. Revísela antes de corregir la jornada."
          );
        }

        entradasPorProducto.set(
          String(detalle.productoId),
          entrada
        );
      }

      const bajas = await BajaCrianza.find({
        loteId: lote._id
      })
        .select("cantidad")
        .session(session)
        .lean();

      const otras = await ProduccionPollo.find({
        loteId: lote._id,
        _id: { $ne: jornada._id }
      })
        .select("pollosProcesados")
        .session(session)
        .lean();

      const disponibles =
        lote.cantidadInicial -
        bajas.reduce(
          (suma, baja) => suma + baja.cantidad,
          0
        ) -
        otras.reduce(
          (suma, item) => suma + item.pollosProcesados,
          0
        );

      if (valores.pollosProcesados > disponibles) {
        throw fallo(
          409,
          `Sólo puede asignar ${disponibles} pollos a esta jornada.`
        );
      }

      const detallesGuardados = [];

      for (const detalle of valores.detalles) {
        const producto = await Producto.findOne({
          _id: detalle.productoId,
          sede: "MONASTERIO",
          origen: "PRODUCCION_MONASTERIO"
        }).session(session);

        if (
          !producto ||
          !producto.descripcion ||
          !Number.isFinite(producto.codigo)
        ) {
          throw fallo(
            400,
            "Revise los productos seleccionados del Monasterio."
          );
        }

        const anterior = entradasPorProducto.get(
          detalle.productoId
        );

        const entradaId =
          anterior?._id || new mongoose.Types.ObjectId();

        const campos = {
          fecha: valores.fecha,
          categoria: producto.categoria,
          productoId: producto._id,
          codigo: producto.codigo,
          cantidad: detalle.pesoKg,
          observacion: "PRODUCCIÓN DEL MONASTERIO",
          sede: "MONASTERIO",
          loteId: lote._id,
          produccionId: jornada._id,
          presentacionProduccion: detalle.presentacion,
          cantidadPresentaciones:
            detalle.cantidadPresentaciones
        };

        if (anterior) {
          const actualizada = await Entrada.updateOne(
            {
              _id: entradaId,
              produccionId: jornada._id,
              loteId: lote._id,
              cierre: { $ne: "S" }
            },
            {
              $set: campos
            },
            {
              session,
              runValidators: true
            }
          );

          if (actualizada.matchedCount !== 1) {
            throw fallo(
              409,
              "Una entrada cambió durante la corrección."
            );
          }

          entradasPorProducto.delete(
            detalle.productoId
          );
        } else {
          await new Entrada({
            _id: entradaId,
            ...campos,
            cierre: "N"
          }).save({ session });
        }

        detallesGuardados.push({
          ...detalle,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          entradaId
        });
      }

      for (const entrada of entradasPorProducto.values()) {
        const eliminada = await Entrada.deleteOne(
          {
            _id: entrada._id,
            produccionId: jornada._id,
            loteId: lote._id,
            cierre: { $ne: "S" }
          },
          {
            session
          }
        );

        if (eliminada.deletedCount !== 1) {
          throw fallo(
            409,
            "Una entrada cambió durante la corrección."
          );
        }
      }

      jornada.set({
        ...valores,
        detalles: detallesGuardados
      });

      jornada.increment();
      await jornada.save({ session });

      await guardarCambioProduccion(
        {
          ...identidad,
          produccionId: jornada._id,
          accion: "MODIFICAR",
          firmaSolicitud,
          antes,
          despues: jornada.toObject()
        },
        session
      );

      guardada = jornada;
    });

    return res.json({
      ok: true,
      repetida,
      mensaje: repetida
        ? "La corrección ya estaba realizada."
        : "Producción y entradas corregidas correctamente.",
      produccion: guardada
    });
  } catch (error) {
    console.error("Error modificando producción:", error);

    return res.status(error.estado || 500).json({
      ok: false,
      mensaje: error.estado
        ? error.message
        : "No se pudo confirmar la corrección. Conserve la solicitud para reintentar."
    });
  } finally {
    if (session) await session.endSession();
  }
}