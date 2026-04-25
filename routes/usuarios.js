import express from "express";
import Usuario from "../models/Usuario.js";

const router = express.Router();

// Ruta para login
router.post("/login", async (req, res) => {
    const { usuario, clave } = req.body; // Debería recibir usuario y clave

    if (!usuario || !clave) {
        return res.status(400).json({ ok: false, mensaje: "Usuario y clave son requeridos" });
    }

    console.log("Datos recibidos:", req.body); // Verifica que está recibiendo los datos.

    try {
        const user = await Usuario.findOne({ usuario });
        if (!user) {
            return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });
        }

        // Comparar contraseñas
        const esPasswordCorrecto = await bcrypt.compare(clave, user.clave);
        if (!esPasswordCorrecto) {
            return res.status(401).json({ ok: false, mensaje: "Clave incorrecta" });
        }

        res.json({
            ok: true,
            mensaje: "Login exitoso",
            usuario: {
                id: user._id,
                usuario: user.usuario,
                rol: user.rol
            }
        });
    } catch (error) {
        console.error("Error en la consulta de usuario:", error);
        res.status(500).json({ ok: false, mensaje: "Error en login", detalle: error.message });
    }
});

export default router;

router.get("/debug-file", (req, res) => {
  res.json({
    ok: true,
    mensaje: "Contenido actual del router",
    rutas: [
      "GET /",
      "GET /:usuario",
      "PUT /:id",
      "DELETE /:id",
      "POST /login (si aparece aquí, Render sí tomó los cambios)"
    ],
    archivoVersion: "v1.0-debug"
  });
});


// LISTAR
router.get("/", async (req, res) => {
  try {
    const usuarios = await Usuario.find();
    res.json(usuarios);
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ ok: false, error: "Error listando usuarios" });
  }
});

// BUSCAR POR USUARIO
router.get("/:usuario", async (req, res) => {
  try {
    const user = await Usuario.findOne({ usuario: req.params.usuario });
    res.json(user);
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error consultando usuario" });
  }
});

// ACTUALIZAR
router.put("/:id", async (req, res) => {
  try {
    const actualizado = await Usuario.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ ok: true, usuario: actualizado });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error actualizando usuario" });
  }
});

// ELIMINAR
router.delete("/:id", async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Error eliminando usuario" });
  }
});

export default router;