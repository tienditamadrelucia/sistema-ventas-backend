import Ventas from "../models/dbVentas.js";
import Moneda from "../models/dbMoneda.js";
import FacturaReserva from "../models/FacturaReserva.js";

import {
  protegerEscrituras,
  fallo,
  validarSede
} from "../utils/controlCaja.js";

const porSede = sede =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

function idValido(id) {
  if (!/^[a-f\d]{24}$/i.test(id || "")) {
    throw fallo(400, "ID inválido");
  }

  return id;
}

function cuerpo(req) {
  const datos = req.body;

  if (
    !datos ||
    typeof datos !== "object" ||
    Array.isArray(datos)
  ) {
    throw fallo(400, "Datos inválidos");
  }

  const camposInvalidos = Object.keys(datos).some(
    key =>
      key.startsWith("$") ||
      key.includes(".") ||
      ["_id", "__v"].includes(key)
  );

  if (camposInvalidos) {
    throw fallo(
      400,
      "Campos de actualización no permitidos"
    );
  }

  return datos;
}

// =====================================================
// VENTAS
// =====================================================
export const protegerVentas = protegerEscrituras(
  async req => {
    const ruta = req.path.replace(/\/$/, "") || "/";

    // Guardado conjunto de venta, productos y pagos.
    if (
      req.method === "POST" &&
      ruta === "/operacion-completa"
    ) {
      const datos = cuerpo(req);
      const nueva = datos.venta;

      if (
        !nueva ||
        typeof nueva !== "object" ||
        Array.isArray(nueva)
      ) {
        throw fallo(400, "Datos de venta inválidos");
      }

      const alcances = [{
        fecha: nueva.fecha,
        sede: nueva.sede || "TIENDITA"
      }];

      // Al editar, revisar también la fecha original
      // y todos los pagos afectados.
      if (datos.ventaId) {
        const original = await Ventas.findById(
          idValido(datos.ventaId)
        ).session(req.cajaMongo);

        if (!original) {
          throw fallo(404, "Venta no encontrada");
        }

        alcances.push(original);

        const pagos = await Moneda.find({
          factura: original.factura,
          ...porSede(original.sede || "TIENDITA")
        }).session(req.cajaMongo);

        alcances.push(...pagos);
      }

      return alcances;
    }

    // Mantener otros ingresos, pero impedir el antiguo
    // guardado separado de una venta normal.
    if (
      req.method === "POST" &&
      ["/", "/guardar"].includes(ruta)
    ) {
      const datos = cuerpo(req);

      if (
        ruta === "/guardar" ||
        (datos.tipoMovimiento || "VENTA") === "VENTA"
      ) {
        throw fallo(
          410,
          "Use el guardado completo de venta, productos y pago"
        );
      }

      return [{
        fecha: datos.fecha,
        sede: datos.sede || "TIENDITA"
      }];
    }

    const cambio =
      /^\/cambiar-estado\/([^/]+)$/.exec(ruta);

    if (req.method === "PUT" && cambio) {
      const venta = await Ventas.findById(
        idValido(cambio[1])
      ).session(req.cajaMongo);

      if (!venta) {
        throw fallo(404, "Venta no encontrada");
      }

      const datos = cuerpo(req);

      if (
        !["CONTADO", "CREDITO"].includes(datos.estado)
      ) {
        throw fallo(400, "Estado inválido");
      }

      req.body = {
        estado: datos.estado
      };

      return [venta];
    }

    throw fallo(
      403,
      "Esta operación requiere una comprobación de caja específica"
    );
  }
);

// =====================================================
// PAGOS Y VUELTOS
// =====================================================
export const protegerMoneda = protegerEscrituras(
  async req => {
    const ruta = req.path.replace(/\/$/, "") || "/";

    if (req.method === "POST" && ruta === "/") {
      const datos = cuerpo(req);

      return [{
        fecha: datos.fecha,
        sede: datos.sede || "TIENDITA"
      }];
    }

    const coincidencia = /^\/([^/]+)$/.exec(ruta);

    if (
      coincidencia &&
      ["PUT", "DELETE"].includes(req.method)
    ) {
      const original = await Moneda.findById(
        idValido(coincidencia[1])
      ).session(req.cajaMongo);

      if (!original) {
        throw fallo(404, "Movimiento no encontrado");
      }

      if (req.method === "DELETE") {
        return [original];
      }

      const datos = cuerpo(req);

      // Comprobar el día original y el de destino.
      return [
        original,
        {
          fecha: datos.fecha ?? original.fecha,
          sede:
            datos.sede ??
            original.sede ??
            "TIENDITA"
        }
      ];
    }

    throw fallo(
      403,
      "Operación de pagos no reconocida"
    );
  }
);

// =====================================================
// FACTURAS Y RESERVAS
// =====================================================
export const protegerFacturas = protegerEscrituras(
  async req => {
    const ruta = req.path.replace(/\/$/, "");

    const completa =
      /^\/eliminar-completa\/([^/]+)$/.exec(ruta);

    const porReserva =
      /^\/(cancelar-sin-pago|cancelar-con-pago|eliminar)\/([^/]+)$/
        .exec(ruta);

    let factura;
    let reserva;
    let sede;

    if (req.method === "DELETE" && completa) {
      factura = Number(completa[1]);

      sede = validarSede(
        req.query.sede || "TIENDITA"
      );
    } else if (
      req.method === "DELETE" &&
      porReserva
    ) {
      reserva = await FacturaReserva.findById(
        idValido(porReserva[2])
      ).session(req.cajaMongo);

      if (!reserva) {
        throw fallo(404, "Reserva no encontrada");
      }

      factura = Number(reserva.numero);
      sede = reserva.sede || "TIENDITA";
    } else if (
      req.method === "POST" &&
      ruta === "/marcar-pago"
    ) {
      factura = Number(
        cuerpo(req).numeroFactura
      );

      reserva = await FacturaReserva.findOne({
        numero: factura
      }).session(req.cajaMongo);

      if (!reserva) {
        throw fallo(404, "Reserva no encontrada");
      }

      sede = reserva.sede || "TIENDITA";
    } else {
      throw fallo(
        403,
        "Operación de factura no reconocida"
      );
    }

    if (
      !Number.isSafeInteger(factura) ||
      factura <= 0
    ) {
      throw fallo(
        400,
        "Número de factura inválido"
      );
    }

    // Las rutas antiguas eliminan pagos sin filtrar sede.
    // Evitar que alcancen registros de la otra sede.
    if (!completa) {
      const ajeno = await Moneda.findOne({
        factura,
        sede: sede === "TIENDITA"
          ? "MONASTERIO"
          : "TIENDITA"
      }).session(req.cajaMongo);

      if (ajeno) {
        throw fallo(
          409,
          "Use la eliminación por factura y sede; " +
          "la ruta antigua puede afectar otra sede"
        );
      }
    }

    const filtro = {
      factura,
      ...porSede(sede)
    };

    const ventas = await Ventas.find(
      filtro
    ).session(req.cajaMongo);

    const pagos = await Moneda.find(
      filtro
    ).session(req.cajaMongo);

    const alcances = [...ventas, ...pagos].map(
      doc => ({
        fecha: doc.fecha,
        sede
      })
    );

    if (!alcances.length && reserva?.fecha) {
      alcances.push({
        fecha: reserva.fecha,
        sede
      });
    }

    return alcances;
  }
);