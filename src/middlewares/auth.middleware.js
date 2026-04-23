export const verificarSesion = (req, res, next) => {
  if (!req.session.usuario) {
    return res.status(401).json({ mensaje: "No autorizado" });
  }
  next();
};
export const soloAdmin = (req, res, next) => {
  if (!req.session.usuario || req.session.usuario.rol !== "admin") {
    return res.status(403).json({ mensaje: "Acceso denegado" });
  }
  next();
};