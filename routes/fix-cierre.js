router.get("/fix-cierre", async (req, res) => {
  try {
    await dbVentas.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });
    await dbEntrada.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });
    await dbSalidas.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });
    await dbGastos.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });
    await dbCaja.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });
    await dbInventario.updateMany({ cierre: { $exists: false } }, { $set: { cierre: "N" } });

    res.json({ ok: true, mensaje: "Campo cierre agregado a todos los documentos existentes" });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});
