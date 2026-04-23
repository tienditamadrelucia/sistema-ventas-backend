import mongoose from "mongoose";
import Cliente from "../models/Cliente.js";
import fs from "fs";

const datos = JSON.parse(fs.readFileSync("./clientes.json", "utf8"));

async function importarClientes() {
  try {
    await mongoose.connect("mongodb://localhost:27017/sistema_ventas", {
      serverSelectionTimeoutMS: 5000
    });

    console.log("Conectado a MongoDB");

    const operaciones = datos.map(c => ({
      updateOne: {
        filter: { identificacion: c.identificacion },
        update: {
          $set: {
            nombreCompleto: c.nombreCompleto,
            direccion: c.direccion,
            telefono: c.telefono,
            fechaIngreso: new Date(c.fechaIngreso)
          }
        },
        upsert: true
      }
    }));

    const resultado = await Cliente.bulkWrite(operaciones, {
      ordered: false
    });

    console.log("Importación completada:");
    console.log("Insertados:", resultado.upsertedCount);
    console.log("Actualizados:", resultado.modifiedCount);

    process.exit();
  } catch (error) {
    console.error("Error importando clientes:", error);
    process.exit(1);
  }
}

importarClientes();