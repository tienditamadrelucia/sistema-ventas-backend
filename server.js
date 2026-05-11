import express from "express";
import cors from "cors";
import { conectarDB } from "./db/conexion.js";

import usuarios from "./routes/usuarios.js";
import categorias from "./routes/categorias.js";
import productos from "./routes/productos.js";
import entradas from "./routes/entradas.js";
import salidas from "./routes/rou_salidas.js";
import inventario from "./routes/rou_inventario.js";
import clientes from "./routes/clientes.js";
import credito from "./routes/credito.js";
import xvendidos from "./routes/xvendidos.js";
import pagos from "./routes/pagos.js";
import vueltos from "./routes/vueltos.js";
import logsRoutes from "./routes/logs.js";
import movimientos from "./routes/rou_movimientos.js";
import tasas from "./routes/rou_tasas.js";
import moneda from "./routes/rou_moneda.js";
import reservaRoutes from "./routes/rou_reserva.js";
import ventas from "./routes/rou_ventas.js";
import vendidos from "./routes/rou_vendidos.js";
import gastos from "./routes/rou_gastos.js";
import caja from "./routes/rou_caja.js";
import TipoGastos from "./routes/rou_tipogastos.js";

const app = express();

// ⭐ CORS CORRECTO PARA RENDER + VERCEL
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://sistema-ventas-frontend-tan.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// app.options("*", ...)
   app.options("/api", (req, res) => { // Cambia "*"' por una ruta específica.
     res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
     res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
     res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
     res.sendStatus(200);
   });

app.use(express.json());


// ⭐ 1. PRUEBA PARA SABER SI EXPRESS ESTÁ VIVO
console.log(">>> BACKEND INICIADO EN ESTA VERSION <<<");
app.get("/api/ping", (req, res) => {
  res.json({ ok: true });
});

// ⭐ 2. CONECTAR DB Y LUEGO LEVANTAR SERVIDOR
(async () => {
  try {
    await conectarDB();
    console.log("🔥 DB LISTA — EL SERVIDOR PUEDE SEGUIR");

    // ⭐ 3. MONTAR RUTAS SOLO DESPUÉS DE LA DB
    app.use("/api/usuarios", usuarios);
    app.use("/api/categorias", categorias);
    app.use("/api/productos", productos);
    app.use("/api/entradas", entradas);
    app.use("/api/salidas", salidas);
    app.use("/api/inventario", inventario);    
    app.use("/api/clientes", clientes);
    app.use("/api/credito", credito);
    //app.use("/api/xvendidos", xvendidos);
    app.use("/api/pagos", pagos);
    app.use("/api/vueltos", vueltos);    
    app.use("/api/logs", logsRoutes);
    //app.use("/api/login", loginRoutes);
    app.use("/api/movimientos", movimientos);
    app.use("/api/tasas", tasas);
    //app.use("/api/ventas", ventasRouter);
    //app.use("/api/vendidos", vendidosRouter);
    app.use("/api/vendidos", vendidos);
    app.use("/api/ventas", ventas);    
    app.use("/api/moneda", moneda);
    app.use("/api/facturas", reservaRoutes);
    app.use("/api/gastos", gastos);
    app.use("/api/caja", caja);    
    app.use("/api/tipogastos", TipoGastos);    

    // ⭐ 4. MANEJO GLOBAL DE ERRORES
    app.use((err, req, res, next) => {
      console.error("ERROR GLOBAL:", err);
      res.status(500).json({
        ok: false,
        mensaje: "Error interno del servidor",
        detalle: err.message
      });
    });

    // ⭐ 5. LEVANTAR SERVIDOR
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log("🚀 Servidor backend en puerto", PORT);
    }); 

  } catch (error) {
    console.error("❌ ERROR CONECTANDO A LA DB:", error);
  }
})();


