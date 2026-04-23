import xlsx from "xlsx";
import fs from "fs";

// Convierte serial de Excel → Date real
function excelSerialToDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const utc_days = serial - 25569;
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

// Fecha de hoy
function fechaHoy() {
  return new Date();
}

// Limpia cédula
function limpiarCedula(id) {
  if (!id) return "";
  return id.toString().toUpperCase().replace(/[^VEJG0-9]/g, "");
}

// Limpia texto general
function limpiarTexto(txt, defecto) {
  if (!txt || txt === "-" || txt.toString().trim() === "") {
    return defecto;
  }
  return txt.toString().toUpperCase().trim();
}

// Limpia teléfono
function limpiarTelefono(tel) {
  if (!tel) return "TELÉFONO POR ACTUALIZAR";
  const limpio = tel.toString().replace(/\D/g, "");
  return limpio.length >= 7 ? limpio : "TELÉFONO POR ACTUALIZAR";
}

// Leer Excel
const workbook = xlsx.readFile("./1clientes.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

// Convertir filas → clientes limpios
const clientes = rows.map(row => {
  const fechaSerial = row["FECHA"];
  const fechaConvertida = excelSerialToDate(fechaSerial);

  return {
    identificacion: limpiarCedula(row["CÉDULA"]),
    nombreCompleto: limpiarTexto(row["NOMBRE"], "CLIENTE POR ACTUALIZAR"),
    direccion: limpiarTexto(row["DIRECCIÓN"], "DIRECCIÓN POR ACTUALIZAR"),
    telefono: limpiarTelefono(row["TELÉFONO"]),
    fechaIngreso: fechaConvertida ? fechaConvertida : fechaHoy()
  };
});

// Guardar JSON
fs.writeFileSync("./clientes.json", JSON.stringify(clientes, null, 2));

console.log("✔ clientes.json generado correctamente con valores por defecto");