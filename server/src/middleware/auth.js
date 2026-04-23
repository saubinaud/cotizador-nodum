const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      rol: decoded.rol,
      igv_rate: decoded.igv_rate,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
  }
}

module.exports = auth;
