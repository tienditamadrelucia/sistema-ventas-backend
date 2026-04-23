import { Router } from "express";
import { registrar, login, logout } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", registrar);
router.post("/login", login);
router.post("/logout", logout);

export default router;