import mongoose from "mongoose";
import xlsx from "xlsx";
import Categoria from "../models/Categoria.js";

async function importarExcel() {
  try {
    await mongoose.connect("mongodb://localhost:27017/tu_base", {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log("Conectado a MongoDB");

    // Nombre EXACTO del archivo
    const workbook = xlsx.readFile("./categorias.xlsx");
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const datos = xlsx.utils.sheet_to_json(hoja);

    console.log("Filas encontradas:", datos.length);

    for (const fila of datos) {
      if (!fila.CATEGORIAS || !fila.CODIGO) continue;

      await Categoria.findOneAndUpdate(
        { categoria: fila.CATEGORIAS },
        {
          categoria: fila.CATEGORIAS,
          codigo: fila.CODIGO
        },
        { upsert: true }
      );

      console.log("✔ Importada:", fila.CATEGORIAS);
    }

    console.log("Importación completada.");
    process.exit();

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

importarExcel();