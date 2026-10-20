import express from "express";
import Usuario from "../models/Usuario.js";

const router = express.Router();

// Ruta para login
router.post("/login", async (req, res) => {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).json({
      ok: false,
      mensaje: "Usuario y clave son requeridos"
    });
  }

  try {
    const user = await Usuario.findOne({ usuario });

    if (!user) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario o clave incorrectos"
      });
    }

    // Compatibilidad con las contraseñas actuales
    if (clave !== user.clave) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario o clave incorrectos"
      });
    }

    // Crear una nueva sesión
    req.session.regenerate((error) => {
      if (error) {
        console.error("Error creando sesión:", error);

        return res.status(500).json({
          ok: false,
          mensaje: "No se pudo iniciar la sesión"
        });
      }

      // Guardar la identidad del usuario en la sesión
      req.session.usuarioId = user._id.toString();

      req.session.save((error) => {
        if (error) {
          console.error("Error guardando sesión:", error);

          return res.status(500).json({
            ok: false,
            mensaje: "No se pudo guardar la sesión"
          });
        }

        return res.json({
          ok: true,
          mensaje: "Login exitoso",
          usuario: {
            id: user._id,
            usuario: user.usuario,
            rol: user.rol,
            accesoTiendita: user.accesoTiendita !== false,
            accesoMonasterio: user.accesoMonasterio === true
          }
        });
      });
    });

  } catch (error) {
    console.error("Error en el login:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "Error al iniciar sesión"
    });
  }
});


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

// CREAR USUARIO
router.post("/", async (req, res) => {
  try {
    const { nombre, usuario, clave, rol, accesoTiendita, accesoMonasterio } = req.body;
    if (!nombre || !usuario || !clave || !rol) {
      return res.status(400).json({ ok: false, mensaje: "Todos los campos son obligatorios" });
    }
    // Verificar si el usuario ya existe
    const existe = await Usuario.findOne({ usuario });
    if (existe) {
      return res.status(400).json({ ok: false, mensaje: "El usuario ya existe" });
    }
    // Crear usuario
    const nuevo = await Usuario.create({ nombre, usuario, clave, rol, accesoTiendita: accesoTiendita !== false, accesoMonasterio: accesoMonasterio === true });
    // Devolver el usuario creado
    res.json({
      ok: true,
      usuario: nuevo
    });
  } catch (error) {
    console.error("Error creando usuario:", error);
    res.status(500).json({ ok: false, mensaje: "Error creando usuario" });
  }
});

// COMPROBAR SESIÓN ACTIVA
router.get("/sesion/actual", async (req, res) => {
  try {
    if (!req.session?.usuarioId) {
      return res.status(401).json({
        ok: false,
        mensaje: "No hay sesión activa"
      });
    }

    const user = await Usuario.findById(req.session.usuarioId);

    if (!user) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario no encontrado"
      });
    }

    return res.json({
      ok: true,
      usuario: {
        id: user._id,
        usuario: user.usuario,
        rol: user.rol,
        accesoTiendita: user.accesoTiendita !== false,
        accesoMonasterio: user.accesoMonasterio === true
      }
    });

  } catch (error) {
    console.error("Error comprobando sesión:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "Error comprobando sesión"
    });
  }
});

export default router;