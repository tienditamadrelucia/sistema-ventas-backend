import mongoose from "mongoose";

import Moneda from "../models/dbMoneda.js";
import Gastos from "../models/dbGastos.js";
import Ventas from "../models/dbVentas.js";
import Vendidos from "../models/dbVendidos.js";
import Producto from "../models/Producto.js";
import ActividadProductiva from "../models/dbListaProductiva.js";

import {
  autenticar,
  exigirAdministrador,
  comprobarAcceso,
  diaComercial,
  fallo,
  responderFallo
} from "../utils/controlCaja.js";

import {
  traducirErrorTransaccion
} from "../utils/transaccionCaja.js";

const monedas = ["D", "P", "Bs"];
const sinActividad = "SIN_ACTIVIDAD";

const cero = () => ({
  D: 0,
  P: 0,
  Bs: 0
});

const id = valor =>
  valor ? String(valor._id || valor) : "";

const sedeDe = documento =>
  documento.sede || "TIENDITA";

const texto = valor =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const claveFactura = documento => {
  const numero = Number(documento.factura);

  return Number.isSafeInteger(numero) && numero > 0
    ? `${sedeDe(documento)}:${numero}`
    : "";
};

const filtroSede = sede =>
  sede === "MONASTERIO"
    ? { sede }
    : {
        $or: [
          { sede: "TIENDITA" },
          { sede: { $exists: false } }
        ]
      };

function centimos(valor, referencia) {
  if (
    valor === null ||
    valor === undefined ||
    valor === "" ||
    !["number", "string"].includes(typeof valor) ||
    !Number.isFinite(Number(valor))
  ) {
    throw fallo(
      422,
      `Hay un importe inválido en ${referencia}`
    );
  }

  const resultado = Math.round(Number(valor) * 100);

  if (!Number.isSafeInteger(resultado)) {
    throw fallo(
      422,
      `Importe fuera de rango en ${referencia}`
    );
  }

  return resultado;
}

function sumar(destino, valores) {
  for (const moneda of monedas) {
    destino[moneda] += valores[moneda];

    if (!Number.isSafeInteger(destino[moneda])) {
      throw fallo(
        422,
        "Los totales exceden el rango permitido"
      );
    }
  }
}

// Repartir centavos conservando el total de cada moneda.
export function repartir(total, pesos) {
  const suma = pesos.reduce(
    (acumulado, peso) => acumulado + peso,
    0
  );

  if (
    !Number.isSafeInteger(total) ||
    !pesos.length ||
    !Number.isFinite(suma) ||
    suma <= 0 ||
    pesos.some(peso =>
      !Number.isFinite(peso) || peso < 0
    )
  ) {
    throw fallo(422, "No se puede repartir el cobro");
  }

  const signo = total < 0 ? -1 : 1;

  const cuotas = pesos.map((peso, indice) => {
    const exacto = Math.abs(total) * (peso / suma);
    const entero = Math.floor(exacto);

    return {
      indice,
      entero,
      resto: exacto - entero
    };
  });

  const pendiente =
    Math.abs(total) -
    cuotas.reduce(
      (acumulado, cuota) => acumulado + cuota.entero,
      0
    );

  if (
    !Number.isSafeInteger(pendiente) ||
    pendiente < 0 ||
    pendiente > pesos.length
  ) {
    throw fallo(
      422,
      "No se pudo conservar el total del cobro al repartirlo"
    );
  }

  const ordenadas = [...cuotas].sort(
    (a, b) =>
      b.resto - a.resto ||
      a.indice - b.indice
  );

  for (let i = 0; i < pendiente; i++) {
    ordenadas[i % ordenadas.length].entero++;
  }

  return cuotas.map(cuota =>
    cuota.entero * signo
  );
}

// =====================================================
// CONSTRUIR EL REPORTE
// =====================================================
export function construirFlujo({
  movimientos,
  gastos,
  ventas,
  vendidos,
  productos,
  actividades
}) {
  const grupos = new Map();

  const nombres = new Map(
    actividades.map(actividad => [
      id(actividad),
      actividad.descripcion || "SIN DESCRIPCIÓN"
    ])
  );

  const productosMap = new Map(
    productos.map(producto => [
      id(producto),
      producto
    ])
  );

  const ventasMap = new Map();
  const lineasMap = new Map();
  const basesMap = new Map();
  const avisos = new Map();

  const aviso = (codigo, mensaje) => {
    const actual = avisos.get(codigo) || {
      mensaje,
      casos: 0
    };

    actual.casos++;
    avisos.set(codigo, actual);
  };

  const grupo = actividadId => {
    const clave = actividadId || sinActividad;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        actividadId: clave,

        actividad: clave === sinActividad
          ? "SIN ACTIVIDAD ASIGNADA"
          : nombres.get(clave) ||
            `ACTIVIDAD NO DISPONIBLE (${clave})`,

        ingresos: cero(),
        gastos: cero(),
        detalleIngresos: [],
        detalleGastos: []
      });
    }

    return grupos.get(clave);
  };

  for (const actividad of actividades) {
    grupo(id(actividad));
  }

  for (const venta of ventas) {
    const clave = claveFactura(venta);

    if (!ventasMap.has(clave)) {
      ventasMap.set(clave, []);
    }

    ventasMap.get(clave).push(venta);
  }

  for (const linea of vendidos) {
    const clave = claveFactura(linea);

    if (!lineasMap.has(clave)) {
      lineasMap.set(clave, []);
    }

    lineasMap.get(clave).push(linea);
  }

  function baseDe(movimiento) {
    const clave = claveFactura(movimiento);

    if (basesMap.has(clave)) {
      return basesMap.get(clave);
    }

    const candidatas = ventasMap.get(clave) || [];
    const lineas = lineasMap.get(clave) || [];
    const pesos = new Map();

    if (
      clave &&
      candidatas.length === 1 &&
      lineas.length
    ) {
      for (const linea of lineas) {
        const total = Number(linea.total);

        if (
          linea.total === null ||
          linea.total === undefined ||
          !Number.isFinite(total) ||
          total < 0
        ) {
          throw fallo(
            422,
            `Total de producto inválido en factura ${movimiento.factura}`
          );
        }

        let actividadId;

        if (
          Object.prototype.hasOwnProperty.call(
            linea,
            "actividadProductiva"
          )
        ) {
          actividadId = id(linea.actividadProductiva);
        } else {
          const producto = productosMap.get(
            id(linea.productoId)
          );

          actividadId = id(
            producto?.actividadProductiva
          );

          if (actividadId) {
            aviso(
              "HISTORICA",
              "Algunas líneas antiguas usan la actividad " +
              "actual del producto porque no guardaron " +
              "su actividad histórica."
            );
          }
        }

        const actividad = actividadId || sinActividad;

        pesos.set(
          actividad,
          (pesos.get(actividad) || 0) + total
        );
      }
    }

    let base = [...pesos].sort(
      ([a], [b]) => a.localeCompare(b)
    );

    const suma = base.reduce(
      (acumulado, [, peso]) => acumulado + peso,
      0
    );

    if (!base.length || suma <= 0) {
      base = [[sinActividad, 1]];

      aviso(
        "SIN_BASE",
        "Hay cobros sin una venta y un detalle únicos " +
        "que permitan asignarlos; se muestran en " +
        "Sin actividad asignada."
      );
    }

    basesMap.set(clave, base);

    return base;
  }

  const omitidos = {
    cantidad: 0,
    importes: cero()
  };

  const campos = {
    D: [
      "efectivoD",
      "zelle"
    ],
    P: [
      "efectivoP",
      "transferenciaP"
    ],
    Bs: [
      "efectivoBs",
      "transferenciaBs",
      "puntoBs",
      "pagomovilBs"
    ]
  };

  // INGRESOS SEGÚN LA FECHA DEL COBRO
  for (const movimiento of movimientos) {
    const operacion = texto(movimiento.operacion);
    const valores = cero();

    for (const moneda of monedas) {
      for (const campo of campos[moneda]) {
        valores[moneda] += centimos(
          movimiento[campo] ?? 0,
          `movimiento ${id(movimiento)}, campo ${campo}`
        );
      }
    }

    const esVuelto = operacion === "VUELTOS";

    const esIngreso = [
      "VENTA",
      "ABONO DE CREDITO",
      "OTRO INGRESO",
      "OTRO_INGRESO",
      "INGRESO"
    ].includes(operacion);

    if (!esIngreso && !esVuelto) {
      omitidos.cantidad++;
      sumar(omitidos.importes, valores);
      continue;
    }

    if (esVuelto) {
      if (monedas.some(moneda => valores[moneda] > 0)) {
        aviso(
          "VUELTO",
          "Hay vueltos guardados con signo positivo; " +
          "el reporte los trata como salidas de dinero."
        );
      }

      for (const moneda of monedas) {
        valores[moneda] = -Math.abs(valores[moneda]);
      }
    }

    if (
      Number(movimiento.total) > 0 &&
      monedas.every(moneda => valores[moneda] === 0)
    ) {
      aviso(
        "SIN_IMPORTES",
        "Hay movimientos con total informado pero sin " +
        "importes por moneda; revise esos registros."
      );
    }

    const base = baseDe(movimiento);

    const asignaciones = base.map(() => cero());

    for (const moneda of monedas) {
      const partes = repartir(
        valores[moneda],
        base.map(([, peso]) => peso)
      );

      partes.forEach((valor, indice) => {
        asignaciones[indice][moneda] = valor;
      });
    }

    base.forEach(([actividadId], indice) => {
      const asignado = asignaciones[indice];
      const destino = grupo(actividadId);

      sumar(destino.ingresos, asignado);

      if (
        monedas.some(moneda => asignado[moneda] !== 0)
      ) {
        destino.detalleIngresos.push({
          id: id(movimiento),
          fecha: movimiento.fecha,
          sede: sedeDe(movimiento),
          factura: movimiento.factura ?? null,
          operacion: movimiento.operacion,
          prorrateado: base.length > 1,
          importes: asignado
        });
      }
    });
  }

  // GASTOS: INCLUIR TODAS LAS CLASIFICACIONES
  for (const gasto of gastos) {
    const codigo = texto(gasto.moneda)
      .replace(/\./g, "");

    let moneda = null;

    if (
      ["D", "USD", "$", "US$", "DOLAR", "DOLARES"]
        .includes(codigo)
    ) {
      moneda = "D";
    } else if (
      ["P", "COP", "PESO", "PESOS"].includes(codigo)
    ) {
      moneda = "P";
    } else if (
      ["BS", "VES", "BOLIVAR", "BOLIVARES"]
        .includes(codigo)
    ) {
      moneda = "Bs";
    }

    if (!moneda) {
      throw fallo(
        422,
        `Moneda desconocida en el gasto ${id(gasto)}: ${gasto.moneda}`
      );
    }

    const valores = cero();

    valores[moneda] = centimos(
      gasto.monto,
      `gasto ${id(gasto)}`
    );

    const destino = grupo(
      id(gasto.actividadProductiva)
    );

    sumar(destino.gastos, valores);

    destino.detalleGastos.push({
      id: id(gasto),
      fecha: gasto.fecha,
      sede: sedeDe(gasto),
      descripcion: gasto.descripcion,
      numeroRecibo: gasto.numeroRecibo || "",
      clasificacion:
        gasto.clasificacion || "SIN_CLASIFICAR",
      moneda,
      monto: valores[moneda]
    });
  }

  const convertir = valores =>
    Object.fromEntries(
      monedas.map(moneda => {
        if (!Number.isSafeInteger(valores[moneda])) {
          throw fallo(
            422,
            "Un total excede el rango permitido"
          );
        }

        return [
          moneda,
          valores[moneda] / 100
        ];
      })
    );

  const totales = {
    ingresos: cero(),
    gastos: cero()
  };

  const reporte = [...grupos.values()]
    .sort((a, b) =>
      a.actividad.localeCompare(b.actividad, "es")
    )
    .map(actividad => {
      sumar(totales.ingresos, actividad.ingresos);
      sumar(totales.gastos, actividad.gastos);

      const diferencia = Object.fromEntries(
        monedas.map(moneda => [
          moneda,
          actividad.ingresos[moneda] -
            actividad.gastos[moneda]
        ])
      );

      return {
        ...actividad,
        ingresos: convertir(actividad.ingresos),
        gastos: convertir(actividad.gastos),
        diferencia: convertir(diferencia),

        detalleIngresos: actividad.detalleIngresos.map(
          detalle => ({
            ...detalle,
            importes: convertir(detalle.importes)
          })
        ),

        detalleGastos: actividad.detalleGastos.map(
          detalle => ({
            ...detalle,
            monto: detalle.monto / 100
          })
        )
      };
    });

  const diferencia = Object.fromEntries(
    monedas.map(moneda => [
      moneda,
      totales.ingresos[moneda] -
        totales.gastos[moneda]
    ])
  );

  return {
    reporte,

    totales: {
      ingresos: convertir(totales.ingresos),
      gastos: convertir(totales.gastos),
      diferencia: convertir(diferencia)
    },

    advertencias: [...avisos.values()],

    movimientosOmitidos: {
      cantidad: omitidos.cantidad,
      importes: convertir(omitidos.importes)
    }
  };
}

// =====================================================
// PERMISO EXCLUSIVO DEL ADMINISTRADOR
// =====================================================
export function soloAdministradorActividad(
  req,
  res,
  next
) {
  return autenticar(req, res, () => {
    try {
      exigirAdministrador(req);
      return next();
    } catch (error) {
      return responderFallo(res, error);
    }
  });
}

// =====================================================
// CONSULTAR DATOS Y GENERAR REPORTE
// =====================================================
export async function obtenerFlujoActividad(req, res) {
  let session;

  try {
    exigirAdministrador(req);

    const desde = diaComercial(req.query.desde);
    const hasta = diaComercial(req.query.hasta);

    if (desde > hasta) {
      throw fallo(
        400,
        "La fecha Desde no puede ser posterior a Hasta"
      );
    }

    const sede = req.query.sede || "TIENDITA";

    if (
      !["TIENDITA", "MONASTERIO", "AMBAS"].includes(sede)
    ) {
      throw fallo(400, "Sede inválida");
    }

    const sedes = sede === "AMBAS"
      ? ["TIENDITA", "MONASTERIO"]
      : [sede];

    for (const seleccion of sedes) {
      comprobarAcceso(req, seleccion);
    }

    const inicio = new Date(
      `${desde}T00:00:00.000Z`
    );

    const fin = new Date(
      new Date(`${hasta}T00:00:00.000Z`).getTime() +
      86400000
    );

    const porSedes = sede === "AMBAS"
      ? {
          $or: [
            { sede: { $in: sedes } },
            { sede: { $exists: false } }
          ]
        }
      : filtroSede(sede);

    const filtro = {
      $and: [
        {
          fecha: {
            $gte: inicio,
            $lt: fin
          }
        },
        porSedes
      ]
    };

    session = await mongoose.connection.startSession();

    let resultado;

    // Lectura consistente de todos los datos del reporte.
    await session.withTransaction(
      async () => {
        const movimientos = await Moneda.find(filtro)
          .sort({ fecha: 1, _id: 1 })
          .session(session)
          .lean();

        const gastos = await Gastos.find(filtro)
          .sort({ fecha: 1, _id: 1 })
          .session(session)
          .lean();

        const actividades =
          await ActividadProductiva.find()
            .session(session)
            .lean();

        const porFactura = sedes
          .map(seleccion => {
            const numeros = [
              ...new Set(
                movimientos
                  .filter(movimiento =>
                    sedeDe(movimiento) === seleccion &&
                    claveFactura(movimiento)
                  )
                  .map(movimiento =>
                    Number(movimiento.factura)
                  )
              )
            ];

            return numeros.length
              ? {
                  $and: [
                    {
                      factura: {
                        $in: numeros
                      }
                    },
                    filtroSede(seleccion)
                  ]
                }
              : null;
          })
          .filter(Boolean);

        const ventas = porFactura.length
          ? await Ventas.find({
              $or: porFactura
            })
              .select("factura sede")
              .session(session)
              .lean()
          : [];

        const vendidos = porFactura.length
          ? await Vendidos.find({
              $or: porFactura
            })
              .select(
                "factura sede productoId total actividadProductiva"
              )
              .session(session)
              .lean()
          : [];

        const idsProductos = [
          ...new Set(
            vendidos
              .map(vendido => id(vendido.productoId))
              .filter(Boolean)
          )
        ];

        const productos = idsProductos.length
          ? await Producto.find({
              _id: {
                $in: idsProductos
              }
            })
              .select("actividadProductiva")
              .session(session)
              .lean()
          : [];

        resultado = construirFlujo({
          movimientos,
          gastos,
          ventas,
          vendidos,
          productos,
          actividades
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
        // Conservar el resultado de la consulta.
      }
    }
  }
}