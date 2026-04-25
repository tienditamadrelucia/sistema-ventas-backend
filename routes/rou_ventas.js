import express from "express";
import { crearVenta, obtenerVentas, buscarVentaPorNumero } from "../controllers/con_ventas.js";

const router = express.Router();

router.post("/", crearVenta);
router.get("/", obtenerVentas);

// ⭐ NUEVA RUTA PARA BUSCAR FACTURA POR NÚMERO

router.get("/vendidos/:numeroFactura", buscarVentaPorNumero);

router.get("/ventas/:fecha", async (req, res) => {
    try {
        const { fecha } = req.params;
        if (!fecha || fecha.length !== 10) {
            return res.json({
                ok: false,
                msg: "Fecha inválida",
                VentasP: 0,
                VentasD: 0,
                VentasBs: 0
            });
        } 
        // Buscar todas las ventas del día
        const ventas = await dbMoneda.find({ fecha });
        // Sumar por moneda
        const VentasP = ventas.reduce((acc, v) => acc + (v.efectivoP || 0), 0);
        const VentasD = ventas.reduce((acc, v) => acc + (v.efectivoD || 0), 0);
        const VentasBs = ventas.reduce((acc, v) => acc + (v.efectivoBs || 0), 0);
        return res.json({
            ok: true,
            VentasP,
            VentasD,
            VentasBs
        });
    } catch (error) {
        console.error("ERROR EN VENTAS:", error);
        return res.status(500).json({
            ok: false,
            msg: "Error interno consultando ventas",
            VentasP: 0,
            VentasD: 0,
            VentasBs: 0
        });
    }
});

export default router;
