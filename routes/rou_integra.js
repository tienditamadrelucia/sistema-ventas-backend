import express from "express";
import {
  detectarDuplicadosMoneda,
  limpiarDuplicadoMoneda,
  detectarDuplicadosVentas,
  eliminarVentaDuplicada,
  detectarDuplicadosVendidos,
  eliminarVendidoDuplicado
} from "../controllers/adminController.js";

import Vendidos from "../models/dbVendidos.js";
import Moneda from "../models/dbMoneda.js";
import Ventas from "../models/dbVentas.js";

const router = express.Router();


// ==========================================
// FUNCIÓN PARA SEPARAR POR SEDE
// ==========================================
// Los registros antiguos que no tienen "sede"
// pertenecen a TIENDITA.
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


// ==========================================
// PAGOS (MONEDA)
// ==========================================
router.get(
  "/duplicados/moneda",
  detectarDuplicadosMoneda
);

router.delete(
  "/eliminar/moneda/:id",
  limpiarDuplicadoMoneda
);


// ==========================================
// VENTAS
// ==========================================
router.get(
  "/duplicados/ventas",
  detectarDuplicadosVentas
);

router.delete(
  "/eliminar/ventas/:id",
  eliminarVentaDuplicada
);


// ==========================================
// VENDIDOS
// ==========================================
router.get(
  "/duplicados/vendidos",
  detectarDuplicadosVendidos
);

router.delete(
  "/eliminar/vendidos/:id",
  eliminarVendidoDuplicado
);


// ==========================================
// MOSTRAR TODOS LOS VENDIDOS
// ==========================================
router.get("/vendidos-todos", async (req, res) => {
  try {
    const sede = req.query.sede || "TIENDITA";

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede = filtroPorSede(sede);

    const registros = await Vendidos.find({
      ...filtroSede
    })
      .populate("productoId", "codigo descripcion")
      .sort({ factura: 1 });

    res.json({
      ok: true,
      registros
    });

  } catch (error) {
    console.error(
      "Error cargando todos los vendidos:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ==========================================
// CORREGIR FECHA MANUALMENTE
// ==========================================
router.put("/corregir-fecha/:tipo/:id", async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { fecha, sede } = req.body;

    if (!fecha || !sede) {
      return res.status(400).json({
        ok: false,
        error: "Fecha y sede son obligatorias"
      });
    }

    if (!["TIENDITA", "MONASTERIO"].includes(sede)) {
      return res.status(400).json({
        ok: false,
        error: "Sede inválida"
      });
    }

    const filtroSede =
      sede === "MONASTERIO"
        ? { sede: "MONASTERIO" }
        : {
            $or: [
              { sede: "TIENDITA" },
              { sede: { $exists: false } }
            ]
          };

    let Modelo;

    if (tipo === "moneda") {
      Modelo = Moneda;
    } else if (tipo === "ventas") {
      Modelo = Ventas;
    } else {
      return res.status(400).json({
        ok: false,
        error: "Tipo de registro inválido"
      });
    }

    const actualizado = await Modelo.findOneAndUpdate(
      {
        _id: id,
        ...filtroSede
      },
      {
        $set: {
          fecha: new Date(`${fecha}T12:00:00`)
        }
      },
      {
        new: true
      }
    );

    if (!actualizado) {
      return res.status(404).json({
        ok: false,
        error: "Registro no encontrado o no pertenece a esta sede"
      });
    }

    res.json({
      ok: true,
      registro: actualizado
    });

  } catch (error) {
    console.error("Error corrigiendo fecha:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;