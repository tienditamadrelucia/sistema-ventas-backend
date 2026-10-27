function sedeDe(documento) {
  return documento.sede === undefined
    ? "TIENDITA"
    : documento.sede;
}

function gramos(valor, permiteNegativo = false) {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor)
  ) {
    return NaN;
  }

  const resultado = Math.round(valor * 1000);

  return (
    Number.isSafeInteger(resultado) &&
    (permiteNegativo || resultado >= 0) &&
    Math.abs(valor * 1000 - resultado) < 0.000001
  )
    ? resultado
    : NaN;
}

function dia(valor) {
  if (!valor) return "";

  const fecha = new Date(valor);

  return Number.isFinite(fecha.getTime())
    ? fecha.toISOString().slice(0, 10)
    : "";
}

export function calcularSaldoConsumoLote({
  loteId,
  sede,
  productos = [],
  entradas = [],
  salidas = [],
  vendidos = [],
  ventas = []
}) {
  const facturaMap = new Map();

  for (
    const venta of ventas.filter(
      (item) => sedeDe(item) === sede
    )
  ) {
    const clave = String(venta.factura);

    if (!facturaMap.has(clave)) {
      facturaMap.set(clave, []);
    }

    facturaMap.get(clave).push(venta);
  }

  const entradasSede = entradas.filter(
    (item) => sedeDe(item) === sede
  );

  const salidasSede = salidas.filter(
    (item) => sedeDe(item) === sede
  );

  const vendidosSede = vendidos.filter(
    (item) => sedeDe(item) === sede
  );

  const grupos = new Map();

  for (const entrada of entradasSede) {
    if (
      String(entrada.loteId || "") !== String(loteId)
    ) {
      continue;
    }

    const productoId = String(entrada.productoId);

    if (!grupos.has(productoId)) {
      grupos.set(productoId, []);
    }

    grupos.get(productoId).push(entrada);
  }

  return [...grupos].map(([productoId, ingresos]) => {
    const bloqueos = new Set();

    const producto = productos.find(
      (item) =>
        String(item._id) === productoId &&
        sedeDe(item) === sede
    );

    if (!producto) {
      bloqueos.add(
        "El producto no existe en esta sede."
      );
    }

    const presentacion =
      ingresos[0].presentacionProduccion;

    if (
      !["PIEZA", "PAQUETE_DOS", "SOLO_PESO"]
        .includes(presentacion)
    ) {
      bloqueos.add(
        "Las entradas no identifican la presentación del producto."
      );
    }

    const usaPiezas = presentacion !== "SOLO_PESO";

    let saldoGramos = 0;
    let saldoPiezas = 0;

    const fechas = ingresos.map(
      (item) => dia(item.fecha)
    );

    if (fechas.some((fecha) => !fecha)) {
      bloqueos.add(
        "Una entrada no tiene fecha válida."
      );
    }

    const primeraFecha =
      fechas.filter(Boolean).sort()[0] || "";

    const esProducto = (item) =>
      String(item.productoId) === productoId;

    function cantidadGramos(valor) {
      const cantidad = gramos(valor);

      if (!Number.isSafeInteger(cantidad)) {
        bloqueos.add(
          "Hay cantidades en kilos que requieren revisión."
        );

        return 0;
      }

      return cantidad;
    }

    function contarPiezas(item, signo) {
      if (!usaPiezas) return;

      if (
        item.presentacionProduccion !== presentacion ||
        !Number.isSafeInteger(
          item.cantidadPresentaciones
        ) ||
        item.cantidadPresentaciones <= 0
      ) {
        bloqueos.add(
          "Faltan piezas o paquetes en un movimiento del lote."
        );
      } else {
        saldoPiezas +=
          signo * item.cantidadPresentaciones;
      }
    }

    for (const ingreso of ingresos) {
      if (
        ingreso.presentacionProduccion !== presentacion
      ) {
        bloqueos.add(
          "El producto tiene presentaciones distintas dentro del lote."
        );
      }

      saldoGramos += cantidadGramos(ingreso.cantidad);
      contarPiezas(ingreso, 1);
    }

    const ingresadoGramos = saldoGramos;

    for (const salida of salidasSede.filter(esProducto)) {
      const loteSalida = String(salida.loteId || "");

      if (loteSalida === String(loteId)) {
        saldoGramos -= cantidadGramos(salida.cantidad);
        contarPiezas(salida, -1);
      } else if (
        !loteSalida &&
        (
          !dia(salida.fecha) ||
          dia(salida.fecha) >= primeraFecha
        )
      ) {
        bloqueos.add(
          "Hay salidas sin lote identificado desde que ingresó esta producción."
        );
      }
    }

    for (
      const vendido of vendidosSede.filter(esProducto)
    ) {
      const loteVenta = String(vendido.loteId || "");

      if (loteVenta === String(loteId)) {
        saldoGramos -= cantidadGramos(
          vendido.cantidad
        );

        contarPiezas(vendido, -1);
        continue;
      }

      if (loteVenta) continue;

      const cabeceras =
        facturaMap.get(String(vendido.factura)) || [];

      if (cabeceras.length > 1) {
        bloqueos.add(
          "Hay facturas repetidas que impiden identificar la fecha de una venta."
        );
        continue;
      }

      const fechaVenta = cabeceras.length === 1
        ? dia(cabeceras[0].fecha)
        : dia(vendido.createdAt);

      if (
        !fechaVenta ||
        fechaVenta >= primeraFecha
      ) {
        bloqueos.add(
          "Hay ventas sin lote identificado desde que ingresó esta producción."
        );
      }
    }

    let general = gramos(
      producto?.stock ?? 0,
      true
    );

    for (
      const entrada of entradasSede.filter(esProducto)
    ) {
      general += cantidadGramos(entrada.cantidad);
    }

    for (
      const salida of salidasSede.filter(esProducto)
    ) {
      general -= cantidadGramos(salida.cantidad);
    }

    for (
      const vendido of vendidosSede.filter(esProducto)
    ) {
      general -= cantidadGramos(vendido.cantidad);
    }

    if (
      ![saldoGramos, general, saldoPiezas]
        .every(Number.isSafeInteger) ||
      saldoGramos < 0 ||
      general < 0 ||
      (usaPiezas && saldoPiezas < 0)
    ) {
      bloqueos.add(
        "Las existencias requieren revisión antes de registrar consumo."
      );
    } else if (saldoGramos > general) {
      bloqueos.add(
        "La existencia general del producto no respalda el saldo del lote."
      );
    }

    if (
      usaPiezas &&
      (
        (saldoGramos === 0) !==
        (saldoPiezas === 0)
      )
    ) {
      bloqueos.add(
        "El saldo de kilos y piezas o paquetes no es consistente."
      );
    }

    const verificado = bloqueos.size === 0;

    return {
      productoId,
      codigo: producto?.codigo ?? ingresos[0].codigo,
      descripcion:
        producto?.descripcion || "Producto no disponible",
      presentacion,
      ingresadoKg: ingresadoGramos / 1000,

      disponibleKg: verificado
        ? saldoGramos / 1000
        : null,

      presentacionesDisponibles:
        verificado && usaPiezas
          ? saldoPiezas
          : null,

      habilitado:
        verificado && saldoGramos > 0,

      bloqueos: [...bloqueos]
    };
  }).sort((a, b) =>
    a.descripcion.localeCompare(
      b.descripcion,
      "es",
      {
        sensitivity: "base",
        numeric: true
      }
    )
  );
}