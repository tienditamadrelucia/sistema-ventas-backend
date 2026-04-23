const actualizarMoneda = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const actualizado = await Moneda.findByIdAndUpdate(
      id,
      data,
      { new: true }   // ⭐ NECESARIO PARA ACTUALIZAR Y NO CREAR UNO NUEVO
    );
    if (!actualizado) {
      return res.status(404).json({ ok: false, mensaje: "Documento no encontrado" });
    }
    res.json({ ok: true, moneda: actualizado });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

const eliminarMoneda = async (req, res) => {
  try {
    const id = req.params.id;
    const eliminado = await Moneda.findByIdAndDelete(id);
    res.json({ ok: true, eliminado });
  } catch (error) {
    res.json({ ok: false, error });
  }
};
