import express from "express";
import cors from "cors";
import { conectarDB } from "./db/conexion.js";
//import loginRoutes from "./routes/login.js";

console.log("🔥 Cargando archivo:", new URL("./routes/usuarios.js", import.meta.url).pathname);
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
//import ventasRouter from "./routes/rou_ventas.js";
//import vendidosRouter from "./routes/rou_vendidos.js";
import moneda from "./routes/rou_moneda.js";
import reservaRoutes from "./routes/rou_reserva.js";
import FacturaReserva from "./models/FacturaReserva.js";
import ventas from "./routes/rou_ventas.js";
import vendidos from "./routes/rou_vendidos.js";
import gastos from "./routes/rou_gastos.js";
import caja from "./routes/rou_caja.js";


const app = express();

app.use(express.json());
app.use(cors({
  origin: [
  "http://localhost:3000",
  "https://sistema-ventas-frontend.onrender.com"
  ],
  credentials: true
}));


// ⭐ 1. PRUEBA PARA SABER SI EXPRESS ESTÁ VIVO
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
    app.use("/api/ventas", ventas);
    app.use("/api/vendidos", vendidos);
    app.use("/api/moneda", moneda);
    app.use("/api/facturas", reservaRoutes);
    app.use("/api/gastos", gastos);
    app.use("/api/caja", caja);    

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


