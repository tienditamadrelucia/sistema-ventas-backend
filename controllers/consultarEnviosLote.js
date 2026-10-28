import EnvioLote from "../models/EnvioLote.js";
import {
  comprobarAcceso,
  diaComercial,
  fallo
} from "../utils/controlCaja.js";

function filtroAcceso(req) {
  const sede = req.query.sede || "TIENDITA";

  comprobarAcceso(req, sede);

  return sede === "MONASTERIO"
    ? { origen: "MONASTERIO" }
    : { destino: "TIENDITA" };
}

function prepararConsulta(consulta) {
  return consulta
    .select("-claveOperacion -claveRecepcion")
    .populate("loteId", "nombre fechaInicio")
    .populate("enviadoPor", "nombre usuario")
    .populate("recibidoPor", "nombre usuario")
    .lean();
}

function responderError(res, error) {
  console.error("Error consultando envíos:", error);

  return res.status(error.estado || 500).json({
    ok: false,
    mensaje: error.estado
      ? error.message
      : "No se pudieron consultar los envíos."
  });
}

// =====================================================
// LISTAR ENVÍOS
// =====================================================
export async function listarEnviosLote(req, res) {
  try {
    const filtro = filtroAcceso(req);
    const pagina = Number(req.query.pagina || 1);
    const limite = 20;

    if (
      !Number.isSafeInteger(pagina) ||
      pagina < 1 ||
      pagina > 10000
    ) {
      throw fallo(
        400,
        "La página indicada no es válida."
      );
    }

    const estado = req.query.estado || "TODOS";

    if (
      ![
        "TODOS",
        "EN_TRANSITO",
        "RECIBIDO",
        "RECIBIDO_CON_DIFERENCIAS"
      ].includes(estado)
    ) {
      throw fallo(
        400,
        "El estado indicado no es válido."
      );
    }

    if (estado !== "TODOS") {
      filtro.estado = estado;
    }

    if (req.query.loteId) {
      if (
        !/^[a-fA-F0-9]{24}$/.test(req.query.loteId)
      ) {
        throw fallo(
          400,
          "El lote indicado no es válido."
        );
      }

      filtro.loteId = req.query.loteId;
    }

    const { desde, hasta } = req.query;

    if (desde || hasta) {
      if (
        typeof desde !== "string" ||
        typeof hasta !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(desde) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(hasta)
      ) {
        throw fallo(
          400,
          "Seleccione ambas fechas para filtrar los envíos."
        );
      }

      const diaInicio = diaComercial(desde);
      const diaFin = diaComercial(hasta);

      if (diaInicio > diaFin) {
        throw fallo(
          400,
          "La fecha inicial supera la fecha final."
        );
      }

      const inicio = new Date(
        `${diaInicio}T00:00:00.000Z`
      );

      const fin = new Date(
        `${diaFin}T00:00:00.000Z`
      );

      fin.setUTCDate(fin.getUTCDate() + 1);

      filtro.fechaEnvio = {
        $gte: inicio,
        $lt: fin
      };
    }

    if (req.query.soloDiferencias === "true") {
      filtro.diferenciasPendientes = true;
    }

    const total = await EnvioLote.countDocuments(
      filtro
    );

    const envios = await prepararConsulta(
      EnvioLote.find(filtro)
        .sort({ fechaEnvio: -1, _id: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
    );

    return res.json({
      ok: true,
      envios,
      pagina,
      total,
      totalPaginas: Math.max(
        1,
        Math.ceil(total / limite)
      )
    });
  } catch (error) {
    return responderError(res, error);
  }
}

// =====================================================
// CONSULTAR DETALLE DEL ENVÍO Y SU RECEPCIÓN
// =====================================================
export async function obtenerEnvioLote(req, res) {
  try {
    const filtro = filtroAcceso(req);
    const { envioId } = req.params;

    if (
      !/^[a-fA-F0-9]{24}$/.test(envioId || "")
    ) {
      throw fallo(
        400,
        "El envío indicado no es válido."
      );
    }

    const envio = await prepararConsulta(
      EnvioLote.findOne({
        _id: envioId,
        ...filtro
      })
    );

    if (!envio) {
      throw fallo(
        404,
        "El envío no existe para esta sede."
      );
    }

    return res.json({
      ok: true,
      envio
    });
  } catch (error) {
    return responderError(res, error);
  }
}