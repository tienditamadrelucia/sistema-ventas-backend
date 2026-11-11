// Sólo prepara los saldos de apertura.
// No modifica productos ni inventarios.
export function aperturaDesdeInventario(
  productos,
  registros
) {
  const porId = new Map(
    productos.map(producto => [
      String(producto._id).toLowerCase(),
      producto
    ])
  );

  const porCodigo = new Map();

  for (const producto of productos) {
    const codigo = String(producto.codigo);
    const lista = porCodigo.get(codigo) || [];

    lista.push(producto);
    porCodigo.set(codigo, lista);
  }

  const conteos = new Map();
  const invalidos = new Set();
  const incidencias = [];

  for (const registro of registros) {
    const referencia = String(
      registro.productoId ?? ""
    )
      .trim()
      .toLowerCase();

    let producto = porId.get(referencia);

    // Compatibilidad con inventarios guardados
    // usando el código en vez del ID del producto.
    if (
      !producto &&
      /^\d+$/.test(referencia)
    ) {
      const candidatos = porCodigo.get(
        String(Number(referencia))
      ) || [];

      if (candidatos.length === 1) {
        producto = candidatos[0];
      } else if (candidatos.length > 1) {
        incidencias.push({
          motivo:
            "El código del inventario identifica " +
            "varios productos de la sede.",

          inventarioId: String(registro._id),
          codigo: referencia
        });

        candidatos.forEach(candidato =>
          invalidos.add(String(candidato._id))
        );

        continue;
      }
    }

    if (!producto) {
      incidencias.push({
        motivo:
          "El producto del inventario no se " +
          "encuentra en el catálogo de esta sede.",

        inventarioId: String(registro._id),
        referencia
      });

      continue;
    }

    const id = String(producto._id);
    const original = registro.stockFisico;

    // Vacío significa que no hubo conteo.
    // Un cero registrado sí es un conteo válido.
    if (
      original === null ||
      original === undefined ||
      (
        typeof original === "string" &&
        original.trim() === ""
      )
    ) {
      continue;
    }

    let cantidad = original;

    if (
      typeof original === "string" &&
      /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(
        original.trim()
      )
    ) {
      cantidad = Number(
        original.trim().replace(",", ".")
      );
    }

    if (
      typeof cantidad !== "number" ||
      !Number.isFinite(cantidad) ||
      cantidad < 0
    ) {
      invalidos.add(id);

      incidencias.push({
        motivo:
          "Conteo físico inválido en el " +
          "inventario de apertura.",

        inventarioId: String(registro._id),
        codigo: producto.codigo
      });

      continue;
    }

    const anterior = conteos.get(id);

    if (
      anterior &&
      anterior.stockInicial !== cantidad
    ) {
      invalidos.add(id);

      incidencias.push({
        motivo:
          "Hay conteos físicos diferentes para " +
          "el mismo producto y fecha.",

        codigo: producto.codigo,

        inventarioIds: [
          ...anterior.inventarioIds,
          String(registro._id)
        ]
      });

      continue;
    }

    if (anterior) {
      anterior.inventarioIds.push(
        String(registro._id)
      );
    } else {
      conteos.set(id, {
        productoId: id,
        codigo: producto.codigo,
        stockInicial: cantidad,
        inventarioIds: [
          String(registro._id)
        ]
      });
    }
  }

  const bases = [...conteos.values()].filter(
    base => !invalidos.has(base.productoId)
  );

  const confirmados = new Set(
    bases.map(base => base.productoId)
  );

  return {
    bases,
    incidencias,

    sinConteo: productos
      .filter(
        producto =>
          !confirmados.has(String(producto._id))
      )
      .map(producto => ({
        productoId: String(producto._id),
        codigo: producto.codigo,
        descripcion: producto.descripcion
      })),

    aviso:
      "Se utiliza stockFisico, no stockReal. " +
      "Un campo vacío no equivale a cero. " +
      "Los conteos deben representar la existencia " +
      "al iniciar el primer día del período."
  };
}