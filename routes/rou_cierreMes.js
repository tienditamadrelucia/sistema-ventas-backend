// rou_cierreMes.js
// Cierre de mes para: dbCaja, dbGastos, dbInventario, dbSalidas, dbVentas, dbEntrada
import express from "express";
import dbCaja from "../models/dbCaja.js";
import dbGastos from "../models/dbGastos.js";
import dbInventario from "../models/dbInventario.js";
import dbSalidas from "../models/dbSalidas.js";
import dbVentas from "../models/dbVentas.js";
import Entrada from "../models/Entrada.js";

const router = express.Router();

const filtroPorSede = (sede) => {
  if (sede === "MONASTERIO") {
    return { sede: "MONASTERIO" };
  }

  return {
    $or: [
      { sede: "TIENDITA" },
      { sede: { $exists: false } }
    ]
  };
};

router.post("/cierre-mes", async (req, res) => {
  const { mes, año, sede } = req.body;

  if (!mes || !año || !sede) {    
    return res.status(400).json({
      ok: false,
      error: "Mes, año y sede son obligatorios"
    });
  }
  
  if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
    return res.status(400).json({
      ok: false,
      error: "Sede inválida"
    });
  }
  const filtroSede = filtroPorSede(sede);
  const inicio = new Date(año, mes - 1, 1);
  const fin = new Date(año, mes, 1);

  try {
    const rVentas = await dbVentas.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        estado: "CONTADO",
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    const rEntradas = await Entrada.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    const rSalidas = await dbSalidas.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    const rGastos = await dbGastos.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    const rCaja = await dbCaja.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    const rInventario = await dbInventario.updateMany(
      {
        fecha: { $gte: inicio, $lt: fin },
        cierre: "N",
        ...filtroSede
      },
      { $set: { cierre: "S" } }
    );

    res.json({
      ok: true,
      mensaje: `Cierre de mes de ${sede} completado correctamente`,
      detalle: {
        ventas: rVentas.modifiedCount,
        entradas: rEntradas.modifiedCount,
        salidas: rSalidas.modifiedCount,
        gastos: rGastos.modifiedCount,
        caja: rCaja.modifiedCount,
        inventario: rInventario.modifiedCount
      }
    });

  } catch (error) {
    console.error("Error cerrando mes:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ⚠️ RUTA TEMPORAL — EJECUTAR UNA SOLA VEZ
router.get("/fix-cierre", async (req, res) => {
  try {
    const r1 = await dbVentas.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    const r2 = await Entrada.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    const r3 = await dbSalidas.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    const r4 = await dbGastos.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    const r5 = await dbCaja.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    const r6 = await dbInventario.updateMany(
      { cierre: { $exists: false } },
      { $set: { cierre: "N" } }
    );

    res.json({
      ok: true,
      mensaje: "Campo 'cierre' agregado a todos los documentos existentes",
      detalle: {
        ventas: r1.modifiedCount,
        entradas: r2.modifiedCount,
        salidas: r3.modifiedCount,
        gastos: r4.modifiedCount,
        caja: r5.modifiedCount,
        inventario: r6.modifiedCount
      }
    });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


export default router;

