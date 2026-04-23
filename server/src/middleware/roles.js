function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ success: false, error: 'No tienes permisos para esta accion' });
    }

    next();
  };
}

module.exports = requireRole;
