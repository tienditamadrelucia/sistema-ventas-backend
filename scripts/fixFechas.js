import mongoose from "mongoose";
import Producto from "../models/Producto.js"; // Ajusta la ruta si es diferente

async function fixFechas() {
  try {
    // Conexión moderna (sin opciones antiguas)
    await mongoose.connect("mongodb://localhost:27017/sistema_ventas");

    console.log("Conectado a la base de datos.");

    const productos = await Producto.find();
    console.log(`Productos encontrados: ${productos.length}`);

    for (const p of productos) {
      let cambiado = false;

      // Caso A: fechaIngreso vacío
      if (p.fechaIngreso === "") {
        p.ingreso = null;
        p.fechaIngreso = undefined;
        cambiado = true;
      }

      // Caso B: fechaIngreso en formato dd/mm/yyyy
      if (typeof p.fechaIngreso === "string" && p.fechaIngreso.includes("/")) {
        const [dia, mes, año] = p.fechaIngreso.split("/");
        const fechaISO = `${año}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
        p.ingreso = new Date(fechaISO);
        p.fechaIngreso = undefined;
        cambiado = true;
      }

      // Caso C: ingreso vacío pero fechaIngreso válida
      if (!p.ingreso && typeof p.fechaIngreso === "string") {
        const fecha = new Date(p.fechaIngreso);
        if (!isNaN(fecha)) {
          p.ingreso = fecha;
          p.fechaIngreso = undefined;
          cambiado = true;
        }
      }

      if (cambiado) {
        await p.save();
        console.log(`✔ Corregido: ${p.descripcion || "(sin descripción)"}`);
      }
    }

    console.log("Proceso completado.");
    process.exit();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixFechas();