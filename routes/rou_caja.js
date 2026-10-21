import express from "express";

import {
  autenticar,
  comprobarAcceso,
  exigirAdministrador,
  diaComercial,
  filtroDia,
  registrosCaja,
  coleccionesCaja,
  comprobarAbierta,
  fallo,
  responderFallo,
  protegerEscrituras
} from "../utils/controlCaja.js";

import {
  revisionDia,
  claveDia
} from "../utils/transaccionCaja.js";

const router = express.Router();

router.use(autenticar);

// Compartir el control de fecha y sede con las ventas.
router.use(
  protegerEscrituras(
    async req => {
      if (req.method !== "POST") {
        throw fallo(
          403,
          "Operación de caja no reconocida"
        );
      }

      const ruta = req.path.replace(/\/$/, "") || "/";

      const verificacion =
        /^\/verificacion\/(\d{4}-\d{2}-\d{2})$/.exec(ruta);

      if (ruta !== "/" && !verificacion) {
        throw fallo(
          403,
          "Operación de caja no reconocida"
        );
      }

      return [{
        fecha: verificacion
          ? verificacion[1]
          : req.body?.fecha,
        sede: req.body?.sede || "TIENDITA"
      }];
    },
    {
      // Las acciones de verificación y reapertura
      // realizan sus propias comprobaciones más abajo.
      permitirVerificada: true
    }
  )
);

// =====================================================
// CONSULTAR VERIFICACIÓN
// =====================================================
router.get("/verificacion/:fecha", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";
    const fecha = diaComercial(req.params.fecha);

    comprobarAcceso(req, sede);

    const cajas = await registrosCaja(fecha, sede);

    const verificado = cajas.some(
      caja => caja.verificado === true
    );

    return res.json({
      ok: true,
      fecha,
      sede,
      verificado,
      revision: await revisionDia(fecha, sede)
    });
  } catch (error) {
    return responderFallo(res, error);
  }
});

// =====================================================
// VERIFICAR DINERO O REABRIR DÍA
// =====================================================
router.post("/verificacion/:fecha", async (req, res) => {
  try {
    exigirAdministrador(req);

    const {
      sede = "TIENDITA",
      accion,
      motivo = ""
    } = req.body || {};

    comprobarAcceso(req, sede);

    const fecha = diaComercial(req.params.fecha);

    const revisionAnterior = req.revisionesCaja.get(
      claveDia(fecha, sede)
    );

    // No verificar un reporte que quedó desactualizado.
    if (
      !Number.isInteger(req.body?.revision) ||
      req.body.revision !== revisionAnterior
    ) {
      throw fallo(
        409,
        "El día cambió desde que se generó el reporte. " +
        "Pulse Buscar y revise de nuevo antes de verificar."
      );
    }

    if (!["VERIFICAR", "REABRIR"].includes(accion)) {
      throw fallo(400, "Acción inválida");
    }

    if (
      typeof motivo !== "string" ||
      motivo.length > 1000
    ) {
      throw fallo(400, "Motivo inválido");
    }

    if (
      accion === "REABRIR" &&
      !motivo.trim()
    ) {
      throw fallo(
        400,
        "Indique el motivo de reapertura"
      );
    }

    const cajas = await registrosCaja(
      fecha,
      sede,
      req.cajaMongo
    );

    const verificado = cajas.some(
      caja => caja.verificado === true
    );

    if (accion === "REABRIR" && !verificado) {
      throw fallo(
        409,
        "El día no está verificado"
      );
    }

    if (accion === "VERIFICAR" && verificado) {
      throw fallo(
        409,
        "El día ya está verificado"
      );
    }

    const ahora = new Date();

    const historial = {
      accion,
      usuario: req.usuarioCaja._id,
      fecha: ahora,
      motivo: motivo.trim()
    };

    const campos = {
      verificado: accion === "VERIFICAR",

      verificadoPor: accion === "VERIFICAR"
        ? req.usuarioCaja._id
        : null,

      fechaVerificacion: accion === "VERIFICAR"
        ? ahora
        : null
    };

    const colecciones = coleccionesCaja();

    if (!cajas.length) {
      // Registrar la verificación sin inventar
      // ni reemplazar importes del arqueo.
      await colecciones[0].insertOne(
        {
          fecha: new Date(
            `${fecha}T00:00:00.000Z`
          ),
          sede,
          ...campos,
          historialVerificacion: [historial]
        },
        {
          session: req.cajaMongo
        }
      );
    } else {
      // Conservar los importes de los registros existentes.
      for (const coleccion of colecciones) {
        await coleccion.updateMany(
          filtroDia(fecha, sede),
          {
            $set: campos,
            $push: {
              historialVerificacion: historial
            }
          },
          {
            session: req.cajaMongo
          }
        );
      }
    }

    return res.json({
      ok: true,
      fecha,
      sede,
      verificado: campos.verificado,
      revision: revisionAnterior + 1
    });
  } catch (error) {
    return responderFallo(res, error);
  }
});

// =====================================================
// GUARDAR ARQUEO DE CAJA
// =====================================================
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const sede = body.sede || "TIENDITA";
    const fecha = diaComercial(body.fecha);

    comprobarAcceso(req, sede);

    await comprobarAbierta(
      fecha,
      sede,
      req.cajaMongo
    );

    const datos = {
      fecha: new Date(`${fecha}T00:00:00.000Z`),
      sede,
      fechaRegistro: new Date()
    };

    const grupos = [
      "cajaChica",
      "gastos",
      "ventas",
      "esperado",
      "contado",
      "diferencia",
      "compensacion"
    ];

    for (const campo of grupos) {
      if (body[campo] === undefined) continue;

      const grupo = body[campo];

      if (
        !grupo ||
        typeof grupo !== "object" ||
        Array.isArray(grupo)
      ) {
        throw fallo(400, "Importes inválidos");
      }

      datos[campo] = {};

      const monedas = campo === "compensacion"
        ? ["D", "P"]
        : ["D", "P", "Bs"];

      for (const moneda of monedas) {
        if (grupo[moneda] === undefined) continue;

        const valor = grupo[moneda];

        if (
          typeof valor !== "number" ||
          !Number.isFinite(valor)
        ) {
          throw fallo(400, "Importes inválidos");
        }

        datos[campo][moneda] = valor;
      }
    }

    if (body.billetes !== undefined) {
      datos.billetes = {};

      for (const moneda of ["D", "P", "Bs"]) {
        const grupo = body.billetes?.[moneda] || {};

        datos.billetes[moneda] = {};

        for (
          const [denominacion, cantidad]
          of Object.entries(grupo)
        ) {
          if (
            !/^\d+(\.\d+)?$/.test(denominacion) ||
            !Number.isInteger(cantidad) ||
            cantidad < 0
          ) {
            throw fallo(400, "Billetes inválidos");
          }

          datos.billetes[moneda][denominacion] = cantidad;
        }
      }
    }

    if (body.cierre !== undefined) {
      if (!["N", "S"].includes(body.cierre)) {
        throw fallo(400, "Cierre inválido");
      }

      datos.cierre = body.cierre;
    }

    // No aceptar campos de verificación enviados
    // mediante el guardado normal de caja.
    const resultado = await coleccionesCaja()[0]
      .insertOne(
        datos,
        {
          session: req.cajaMongo
        }
      );

    return res.json({
      ok: true,
      id: resultado.insertedId
    });
  } catch (error) {
    return responderFallo(res, error);
  }
});

// =====================================================
// CONSULTAR CAJA POR FECHA Y SEDE
// =====================================================
router.get("/:fecha", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";

    comprobarAcceso(req, sede);

    const movimientos = await registrosCaja(
      req.params.fecha,
      sede
    );

    return res.json(movimientos);
  } catch (error) {
    return responderFallo(res, error);
  }
});

export default router;