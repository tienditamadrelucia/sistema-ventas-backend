import mongoose from "mongoose";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";

import {
  comprobarAcceso,
  exigirAdministrador,
  diaComercial,
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

import {
  traducirErrorTransaccion
} from "../utils/transaccionCaja.js";

const porSede = (sede) =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

const claveFactura = (dato) =>
  `${dato.sede || "TIENDITA"}:${dato.factura}`;

const campos = [
  "ventasUSD",
  "ventasConCostoUSD",
  "costoVentasUSD",
  "gananciaBrutaUSD",
  "ventasSinCostoUSD"
];

export function resumirGananciaReventa({
  ventas,
  vendidos,
  productos
}) {
  const facturas = new Set();

  for (const venta of ventas) {
    const clave = claveFactura(venta);

    if (facturas.has(clave)) {
      throw fallo(
        409,
        "Hay números de factura repetidos en la misma sede. Deben revisarse antes de calcular la ganancia."
      );
    }

    facturas.add(clave);
  }

  const catalogo = new Map(
    productos.map((p) => [String(p._id), p])
  );

  const grupos = new Map();

  const sinOrigen = {
    renglones: 0,
    unidades: 0,
    ventasUSD: 0
  };

  for (const linea of vendidos) {
    if (!facturas.has(claveFactura(linea))) continue;

    const cantidad = linea.cantidad;
    const importe = linea.total;

    if (
      typeof cantidad !== "number" ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0 ||
      typeof importe !== "number" ||
      !Number.isFinite(importe) ||
      importe < 0
    ) {
      throw fallo(
        422,
        "Hay cantidades o importes inválidos en los productos vendidos. No se calculó la ganancia."
      );
    }

    const ingreso = Math.round(
      (importe + Number.EPSILON) * 100
    );

    if (!Number.isSafeInteger(ingreso)) {
      throw fallo(422, "Un importe excede el límite admitido.");
    }

    if (
      linea.origenProducto === "PRODUCCION_MONASTERIO"
    ) {
      continue;
    }

    if (linea.origenProducto !== "COMPRADO") {
      sinOrigen.renglones++;
      sinOrigen.unidades += cantidad;
      sinOrigen.ventasUSD += ingreso;
      continue;
    }

    const id = String(linea.productoId);
    const sede = linea.sede || "TIENDITA";
    const clave = `${sede}:${id}`;

    if (!grupos.has(clave)) {
      const producto = catalogo.get(id);

      grupos.set(clave, {
        productoId: id,
        sede,
        codigo: producto?.codigo ?? "",
        descripcion:
          producto?.descripcion ||
          "Producto no disponible en el catálogo",
        unidades: 0,
        unidadesConCosto: 0,
        unidadesSinCosto: 0,
        ventasUSD: 0,
        ventasConCostoUSD: 0,
        costoVentasUSD: 0,
        gananciaBrutaUSD: 0,
        ventasSinCostoUSD: 0
      });
    }

    const fila = grupos.get(clave);

    fila.unidades += cantidad;
    fila.ventasUSD += ingreso;

    const costo = linea.costoUnitarioUSD;

    if (
      typeof costo === "number" &&
      Number.isFinite(costo) &&
      costo >= 0
    ) {
      const costoTotal = Math.round(
        (cantidad * costo + Number.EPSILON) * 100
      );

      if (!Number.isSafeInteger(costoTotal)) {
        throw fallo(
          422,
          "Un costo excede el límite admitido."
        );
      }

      fila.unidadesConCosto += cantidad;
      fila.ventasConCostoUSD += ingreso;
      fila.costoVentasUSD += costoTotal;
      fila.gananciaBrutaUSD += ingreso - costoTotal;
    } else {
      fila.unidadesSinCosto += cantidad;
      fila.ventasSinCostoUSD += ingreso;
    }
  }

  const totales = {
    unidades: 0,
    unidadesConCosto: 0,
    unidadesSinCosto: 0
  };

  for (const campo of campos) {
    totales[campo] = 0;
  }

  const reporte = [...grupos.values()].sort((a, b) =>
    a.descripcion.localeCompare(b.descripcion, "es")
  );

  for (const fila of reporte) {
    for (const campo of Object.keys(totales)) {
      totales[campo] += fila[campo];
    }

    for (const campo of campos) {
      fila[campo] /= 100;
    }
  }

  for (const campo of campos) {
    totales[campo] /= 100;
  }

  sinOrigen.ventasUSD /= 100;

  return {
    reporte,
    totales,
    sinOrigen
  };
}

export async function obtenerGananciaReventa(req, res) {
  let session;

  try {
    exigirAdministrador(req);

    const desde = diaComercial(req.query.desde);
    const hasta = diaComercial(req.query.hasta);
    const sede = req.query.sede || "TIENDITA";

    if (
      !["TIENDITA", "MONASTERIO", "AMBAS"].includes(sede)
    ) {
      throw fallo(400, "Sede inválida.");
    }

    if (desde > hasta) {
      throw fallo(
        400,
        "La fecha desde no puede ser posterior a hasta."
      );
    }

    const sedes =
      sede === "AMBAS"
        ? ["TIENDITA", "MONASTERIO"]
        : [sede];

    for (const elegida of sedes) {
      comprobarAcceso(req, elegida);
    }

    const inicio = new Date(
      `${desde}T00:00:00.000Z`
    );

    const fin = new Date(
      `${hasta}T00:00:00.000Z`
    );

    fin.setUTCDate(fin.getUTCDate() + 1);

    session = await mongoose.connection.startSession();

    let resultado;

    await session.withTransaction(
      async () => {
        const ventas = await Ventas.find({
          fecha: {
            $gte: inicio,
            $lt: fin
          },
          tipoMovimiento: {
            $ne: "OTRO_INGRESO"
          },
          $or: sedes.map(porSede)
        })
          .select("factura sede")
          .session(session)
          .lean();

        if (
          ventas.some(
            (venta) => !Number.isFinite(venta.factura)
          )
        ) {
          throw fallo(
            422,
            "Hay ventas sin número de factura válido."
          );
        }

        const filtros = sedes.map((elegida) => ({
          factura: {
            $in: ventas
              .filter(
                (venta) =>
                  (venta.sede || "TIENDITA") === elegida
              )
              .map((venta) => venta.factura)
          },
          ...porSede(elegida)
        }));

        const vendidos = await Vendidos.find({
          $or: filtros
        })
          .session(session)
          .lean();

        const productos = await Producto.find({
          _id: {
            $in: vendidos.map(
              (vendido) => vendido.productoId
            )
          }
        })
          .select("codigo descripcion")
          .session(session)
          .lean();

        resultado = resumirGananciaReventa({
          ventas,
          vendidos,
          productos
        });
      },
      {
        readConcern: {
          level: "snapshot"
        },
        writeConcern: {
          w: "majority"
        }
      }
    );

    return res.json({
      ok: true,
      desde,
      hasta,
      sede,
      ...resultado
    });
  } catch (error) {
    return responderFallo(
      res,
      traducirErrorTransaccion(error)
    );
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Mantener el resultado de la consulta.
      }
    }
  }
}