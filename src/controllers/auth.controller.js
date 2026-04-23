import Usuario from "../models/user.model.js";
import bcrypt from "bcrypt";

// Registro
export const registrar = async (req, res) => {
  try {
    const { nombre, contraseña, rol } = req.body;

    // Verificar si el nombre ya existe
    const existe = await Usuario.findOne({ nombre });
    if (existe) {
      return res.status(400).json({ mensaje: "El nombre de usuario ya existe" });
    }

    // Encriptar contraseña
    const hash = await bcrypt.hash(contraseña, 10);

    const nuevoUsuario = new Usuario({
      nombre,
      contraseña: hash,
      rol: rol || "usuario"
    });

    await nuevoUsuario.save();

    res.json({ mensaje: "Usuario registrado correctamente" });

  } catch (error) {
    res.status(500).json({ mensaje: "Error en el servidor" });
  }
};

// Login
export const login = async (req, res) => {
  try {
    console.log("BODY RECIBIDO:", req.body);
    const { nombre, contraseña } = req.body;

    const usuario = await Usuario.findOne({ nombre });
    if (!usuario) {
      return res.status(400).json({ mensaje: "Credenciales incorrectas" });
    }

    const coincide = await bcrypt.compare(contraseña, usuario.contraseña);
    if (!coincide) {
      return res.status(400).json({ mensaje: "Credenciales incorrectas" });
    }

    // Guardar sesión
    req.session.usuario = {
      id: usuario._id,
      nombre: usuario.nombre,
      rol: usuario.rol
    };

    res.json({
  mensaje: "Login exitoso",
  usuario: usuario.nombre
});

  } catch (error) {
    res.status(500).json({ mensaje: "Error en el servidor" });
  }
};

// Logout
export const logout = (req, res) => {
  req.session.destroy();
  res.json({ mensaje: "Sesión cerrada" });
};

