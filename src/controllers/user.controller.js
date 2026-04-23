import Usuario from "../models/user.model.js";

// Listar todos
export const listarUsuarios = async (req, res) => {
  const usuarios = await Usuario.find().select("-contraseña");
  res.json(usuarios);
};

// Obtener uno
export const obtenerUsuario = async (req, res) => {
  const usuario = await Usuario.findById(req.params.id).select("-contraseña");
  if (!usuario) return res.status(404).json({ mensaje: "No encontrado" });
  res.json(usuario);
};

// Editar
export const editarUsuario = async (req, res) => {
  const { nombre, rol } = req.body;

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { nombre, rol },
    { new: true }
  ).select("-contraseña");

  if (!usuario) return res.status(404).json({ mensaje: "No encontrado" });

  res.json({ mensaje: "Usuario actualizado", usuario });
};

// Eliminar
export const eliminarUsuario = async (req, res) => {
  const usuario = await Usuario.findByIdAndDelete(req.params.id);
  if (!usuario) return res.status(404).json({ mensaje: "No encontrado" });

  res.json({ mensaje: "Usuario eliminado" });
};