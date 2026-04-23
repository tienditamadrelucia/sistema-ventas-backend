import { Router } from "express";
import { listarUsuarios, obtenerUsuario, editarUsuario, eliminarUsuario } from "../controllers/user.controller.js";
import { verificarSesion, soloAdmin } from "../middlewares/auth.middleware.js";

const router = Router();

// Solo admin puede gestionar usuarios
router.get("/", verificarSesion, soloAdmin, listarUsuarios);
router.get("/:id", verificarSesion, soloAdmin, obtenerUsuario);
router.put("/:id", verificarSesion, soloAdmin, editarUsuario);
router.delete("/:id", verificarSesion, soloAdmin, eliminarUsuario);

export default router;