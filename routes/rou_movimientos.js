import express from "express";
import Entrada from "../models/Entrada.js";
import Salida from "../models/dbSalidas.js";
import Vendidos from "../models/dbVendidos.js";
import Ventas from "../models/dbVentas.js";

const router = express.Router();

const filtroPorSede = (sede) =>
  sede === "MONASTERIO"
    ? { sede: "MONASTERIO" }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

function convertirFecha(valor) {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    return null;
  }

  const fecha = new Date(`${valor}T00:00:00.000Z`);

  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== valor
  ) {
    return null;
  }

  return fecha;
}

router.get("/:productoId", async (req, res) => {
  try {
    const { productoId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const sede = req.query.sede || "TIENDITA";

    if (!/^[a-f\d]{24}$/i.test(productoId)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Identificador de producto inválido."
      });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Sede inválida."
      });
    }

    const inicio = convertirFecha(fechaInicio);
    const ultimoDia = convertirFecha(fechaFin);

    if (!inicio || !ultimoDia || inicio > ultimoDia) {
      return res.status(400).json({
        ok: false,
        mensaje: "Seleccione un rango de fechas válido."
      });
    }

    const fin = new Date(ultimoDia);
    fin.setUTCDate(fin.getUTCDate() + 1);

    const dentroDelRango = (valor) => {
      if (!valor) return false;

      const fecha = new Date(valor);

      return (
        Number.isFinite(fecha.getTime()) &&
        fecha >= inicio &&
        fecha < fin
      );
    };

    const filtroSede = filtroPorSede(sede);

    // ENTRADAS Y SALIDAS: fecha del movimiento.
    const entradas = await Entrada.find({
      productoId,
      fecha: {
        $gte: inicio,
        $lt: fin
      },
      ...filtroSede
    }).lean();

    const salidas = await Salida.find({
      productoId,
      fecha: {
        $gte: inicio,
        $lt: fin
      },
      ...filtroSede
    }).lean();

    // No filtrar los detalles por createdAt.
    // Primero buscamos sus facturas y usamos la fecha de venta.
    const vendidos = await Vendidos.find({
      productoId,
      ...filtroSede
    })
      .populate("productoId", "codigo descripcion")
      .lean();

    const numerosFactura = [
      ...new Set(
        vendidos
          .map((v) => v.factura)
          .filter((numero) => Number.isFinite(numero))
      )
    ];

    const ventas = await Ventas.find({
      factura: {
        $in: numerosFactura
      },
      ...filtroSede
    })
      .select("factura fecha estado tipoMovimiento")
      .lean();

    const ventasPorFactura = new Map();

    for (const venta of ventas) {
      const numero = String(venta.factura);

      if (!ventasPorFactura.has(numero)) {
        ventasPorFactura.set(numero, []);
      }

      ventasPorFactura.get(numero).push(venta);
    }

    const movimientosVenta = [];
    const incidencias = [];

    for (const vendido of vendidos) {
      const coincidencias =
        ventasPorFactura.get(String(vendido.factura)) || [];

      if (coincidencias.length !== 1) {
        // createdAt solo sirve para localizar la incidencia;
        // no se utiliza como fecha de venta.
        const afectaRango =
          dentroDelRango(vendido.createdAt) ||
          coincidencias.some((v) => dentroDelRango(v.fecha));

        if (afectaRango) {
          incidencias.push({
            detalleId: vendido._id,
            factura: vendido.factura,
            cantidad: vendido.cantidad,
            fechaRegistro: vendido.createdAt,
            motivo:
              coincidencias.length === 0
                ? "No se encontró la factura de esta sede."
                : "Hay varias facturas con ese número en esta sede."
          });
        }

        continue;
      }

      const venta = coincidencias[0];

      if (!dentroDelRango(venta.fecha)) continue;

      if (venta.tipoMovimiento === "OTRO_INGRESO") {
        incidencias.push({
          detalleId: vendido._id,
          factura: vendido.factura,
          cantidad: vendido.cantidad,
          fechaRegistro: vendido.createdAt,
          motivo:
            "El detalle está asociado a un movimiento de otro ingreso."
        });

        continue;
      }

      movimientosVenta.push({
        id: vendido._id,
        tipo: "VENTA",
        fecha: venta.fecha,
        fechaRegistro: vendido.createdAt,
        cantidad: vendido.cantidad,
        total: vendido.total,
        factura: vendido.factura,
        estado: venta.estado,
        producto: vendido.productoId?.descripcion || "",
        codigo: vendido.productoId?.codigo || "",
        observacion: `Factura ${vendido.factura}`,
        origen: "Vendidos"
      });
    }

    const movimientos = [
      ...entradas.map((entrada) => ({
        id: entrada._id,
        tipo: "ENTRADA",
        fecha: entrada.fecha,
        cantidad: entrada.cantidad,
        observacion: entrada.observacion || "",
        origen: "Entradas"
      })),

      ...salidas.map((salida) => ({
        id: salida._id,
        tipo: "SALIDA",
        fecha: salida.fecha,
        cantidad: salida.cantidad,
        observacion: salida.observacion || "",
        origen: "Salidas"
      })),

      ...movimientosVenta
    ];

    movimientos.sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    );

    return res.json({
      ok: true,
      sede,
      movimientos,
      incidencias,
      advertencia:
        incidencias.length > 0
          ? "Hay detalles que requieren revisión y no se incluyeron como ventas confirmadas."
          : ""
    });
  } catch (error) {
    console.error("Error obteniendo movimientos:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo movimientos."
    });
  }
});

export default router;