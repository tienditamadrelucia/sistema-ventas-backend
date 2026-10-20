import express from "express";
import Usuario from "../models/Usuario.js";

const router = express.Router();

const roles = new Set([
  "ADMINISTRADOR",
  "SUPERVISOR",
  "USUARIO"
]);

const campos = [
  "nombre",
  "usuario",
  "clave",
  "rol",
  "accesoTiendita",
  "accesoMonasterio"
];

const tiene = (obj, campo) =>
  Object.prototype.hasOwnProperty.call(obj, campo);

// Nunca devolver documentos completos ni contraseñas.
function publico(user) {
  return {
    _id: user._id,
    nombre: user.nombre,
    usuario: user.usuario,
    rol: user.rol,
    accesoTiendita: user.accesoTiendita !== false,
    accesoMonasterio: user.accesoMonasterio === true
  };
}

function identidad(user) {
  const { _id, ...datos } = publico(user);
  return { id: _id, ...datos };
}

function responderError(res, error, mensaje) {
  // Los errores internos pueden contener datos sensibles.
  if (error?.code === 11000) {
    return res.status(409).json({
      ok: false,
      mensaje: "El usuario ya existe"
    });
  }

  if (
    error?.name === "ValidationError" ||
    error?.name === "CastError"
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: "Datos de usuario inválidos"
    });
  }

  return res.status(500).json({
    ok: false,
    mensaje
  });
}

function validarDatos(body, crear = false) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return { error: "Datos de usuario inválidos" };
  }

  const datos = {};

  for (const campo of campos) {
    if (!tiene(body, campo)) continue;

    const valor = body[campo];

    // Al editar, una clave vacía conserva la actual.
    if (campo === "clave" && !crear && valor === "") {
      continue;
    }

    if (
      campo === "accesoTiendita" ||
      campo === "accesoMonasterio"
    ) {
      if (typeof valor !== "boolean") {
        return {
          error: "Los permisos deben ser booleanos"
        };
      }
    } else {
      if (typeof valor !== "string" || !valor.trim()) {
        return {
          error: "Nombre, usuario, clave y rol deben ser textos no vacíos"
        };
      }

      if (campo === "rol" && !roles.has(valor)) {
        return { error: "Rol inválido" };
      }
    }

    // Conservar los textos, especialmente la contraseña.
    datos[campo] = valor;
  }

  if (
    crear &&
    ["nombre", "usuario", "clave", "rol"].some(
      campo => !tiene(datos, campo)
    )
  ) {
    return {
      error: "Nombre, usuario, clave y rol son obligatorios"
    };
  }

  if (!crear && Object.keys(datos).length === 0) {
    return {
      error: "No hay campos válidos para actualizar"
    };
  }

  return { datos };
}
async function soloAdministrador(req, res, next) {
  try {
    if (!req.session?.usuarioId) {
      return res.status(401).json({
        ok: false,
        mensaje: "Debe iniciar sesión"
      });
    }

    const user = await Usuario.findById(
      req.session.usuarioId
    ).select("-clave");

    if (!user) {
      return res.status(401).json({
        ok: false,
        mensaje: "La sesión ya no es válida"
      });
    }

    if (user.rol !== "ADMINISTRADOR") {
      return res.status(403).json({
        ok: false,
        mensaje: "Acceso permitido solo a administradores"
      });
    }

    return next();
  } catch (error) {
    return responderError(
      res,
      error,
      "Error verificando permisos"
    );
  }
}

router.post("/login", async (req, res) => {
  const { usuario, clave } = req.body || {};

  if (
    typeof usuario !== "string" ||
    !usuario.trim() ||
    typeof clave !== "string" ||
    !clave
  ) {
    return res.status(400).json({
      ok: false,
      mensaje: "Usuario y clave son requeridos"
    });
  }

  try {
    // Compatibilidad temporal con claves en texto plano.
    const user = await Usuario.findOne({
      usuario
    }).select("+clave");

    if (!user || clave !== user.clave) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario o clave incorrectos"
      });
    }

    if (!req.session) {
      return res.status(500).json({
        ok: false,
        mensaje: "El servicio de sesiones no está disponible"
      });
    }

    return req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({
          ok: false,
          mensaje: "No se pudo iniciar la sesión"
        });
      }

      req.session.usuarioId = user._id.toString();

      return req.session.save(error => {
        if (error) {
          return res.status(500).json({
            ok: false,
            mensaje: "No se pudo guardar la sesión"
          });
        }

        return res.json({
          ok: true,
          mensaje: "Login exitoso",
          usuario: identidad(user)
        });
      });
    });
  } catch (error) {
    return responderError(
      res,
      error,
      "Error al iniciar sesión"
    );
  }
});

router.get("/sesion/actual", async (req, res) => {
  try {
    if (!req.session?.usuarioId) {
      return res.status(401).json({
        ok: false,
        mensaje: "No hay sesión activa"
      });
    }

    const user = await Usuario.findById(
      req.session.usuarioId
    ).select("-clave");

    if (!user) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario no encontrado"
      });
    }

    return res.json({
      ok: true,
      usuario: identidad(user)
    });
  } catch (error) {
    return responderError(
      res,
      error,
      "Error comprobando sesión"
    );
  }
});
router.get("/", soloAdministrador, async (req, res) => {
  try {
    const usuarios = await Usuario.find().select("-clave");

    return res.json(usuarios.map(publico));
  } catch (error) {
    return responderError(
      res,
      error,
      "Error listando usuarios"
    );
  }
});

router.get(
  "/:usuario",
  soloAdministrador,
  async (req, res) => {
    try {
      const user = await Usuario.findOne({
        usuario: req.params.usuario
      }).select("-clave");

      if (!user) {
        return res.status(404).json({
          ok: false,
          mensaje: "Usuario no encontrado"
        });
      }

      return res.json(publico(user));
    } catch (error) {
      return responderError(
        res,
        error,
        "Error consultando usuario"
      );
    }
  }
);

router.post("/", soloAdministrador, async (req, res) => {
  const { datos, error } = validarDatos(req.body, true);

  if (error) {
    return res.status(400).json({
      ok: false,
      mensaje: error
    });
  }

  try {
    const existe = await Usuario.findOne({
      usuario: datos.usuario
    }).select("_id");

    if (existe) {
      return res.status(409).json({
        ok: false,
        mensaje: "El usuario ya existe"
      });
    }

    const nuevo = await Usuario.create({
      ...datos,
      accesoTiendita: datos.accesoTiendita !== false,
      accesoMonasterio: datos.accesoMonasterio === true
    });

    return res.json({
      ok: true,
      usuario: publico(nuevo)
    });
  } catch (error) {
    return responderError(
      res,
      error,
      "Error creando usuario"
    );
  }
});
router.put(
  "/:id",
  soloAdministrador,
  async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({
        ok: false,
        mensaje: "ID inválido"
      });
    }

    const { datos, error } = validarDatos(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        mensaje: error
      });
    }

    try {
      if (tiene(datos, "usuario")) {
        const existe = await Usuario.findOne({
          usuario: datos.usuario,
          _id: { $ne: req.params.id }
        }).select("_id");

        if (existe) {
          return res.status(409).json({
            ok: false,
            mensaje: "El usuario ya existe"
          });
        }
      }

      const actualizado = await Usuario.findByIdAndUpdate(
        req.params.id,
        { $set: datos },
        { new: true, runValidators: true }
      ).select("-clave");

      if (!actualizado) {
        return res.status(404).json({
          ok: false,
          mensaje: "Usuario no encontrado"
        });
      }

      return res.json({
        ok: true,
        usuario: publico(actualizado)
      });
    } catch (error) {
      return responderError(
        res,
        error,
        "Error actualizando usuario"
      );
    }
  }
);

router.delete(
  "/:id",
  soloAdministrador,
  async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({
        ok: false,
        mensaje: "ID inválido"
      });
    }

    try {
      const eliminado = await Usuario.findByIdAndDelete(
        req.params.id
      ).select("_id");

      if (!eliminado) {
        return res.status(404).json({
          ok: false,
          mensaje: "Usuario no encontrado"
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      return responderError(
        res,
        error,
        "Error eliminando usuario"
      );
    }
  }
);

export default router;