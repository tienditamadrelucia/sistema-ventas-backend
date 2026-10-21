import express from "express";

import {
  crearVendido,
  obtenerVendidosPorVenta
} from "../controllers/con_vendidos.js";

import Ventas from "../models/dbVentas.js";

import {
  protegerEscrituras,
  fallo,
  validarSede
} from "../utils/controlCaja.js";

const router = express.Router();

router.use(
  protegerEscrituras(async req => {
    const ruta = req.path.replace(/\/$/, "") || "/";

    if (req.method !== "POST" || ruta !== "/") {
      throw fallo(
        403,
        "Operación de productos vendidos no reconocida"
      );
    }

    const datos = req.body || {};

    if (
      typeof datos.factura !== "number" &&
      typeof datos.factura !== "string"
    ) {
      throw fallo(400, "Número de factura inválido");
    }

    const factura = Number(datos.factura);

    const sede = validarSede(
      datos.sede || "TIENDITA"
    );

    if (
      !Number.isSafeInteger(factura) ||
      factura <= 0
    ) {
      throw fallo(400, "Número de factura inválido");
    }

    const filtroSede = sede === "MONASTERIO"
      ? { sede: "MONASTERIO" }
      : {
          $or: [
            { sede: "TIENDITA" },
            { sede: { $exists: false } }
          ]
        };

    // Consultar la fecha real de la venta
    // dentro de la misma transacción.
    const coincidencias = await Ventas.find({
      factura,
      ...filtroSede
    })
      .select("fecha sede")
      .limit(2)
      .session(req.cajaMongo);

    if (coincidencias.length !== 1) {
      throw fallo(
        409,
        "Debe existir una única venta para registrar sus productos"
      );
    }

    return [{
      fecha: coincidencias[0].fecha,
      sede
    }];
  })
);

router.post("/", crearVendido);

router.get("/:factura", obtenerVendidosPorVenta);

export default router;