const jwt = require('jsonwebtoken');
const pool = require('../models/db');

async function auth(req, res, next) {
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
      empresa_id: decoded.empresa_id || null,
      rol_empresa: decoded.rol_empresa || 'owner',
    };

    // If empresa_id not in token, look it up
    if (!req.user.empresa_id) {
      try {
        const empRes = await pool.query('SELECT empresa_id, rol_empresa FROM usuarios WHERE id = $1', [req.user.id]);
        if (empRes.rows.length > 0) {
          req.user.empresa_id = empRes.rows[0].empresa_id;
          req.user.rol_empresa = empRes.rows[0].rol_empresa;
        }
      } catch (_) {}
    }

    // Helper: get the correct filter for data queries
    // During transition: use empresa_id if available, else usuario_id
    req.dataFilter = req.user.empresa_id
      ? { column: 'empresa_id', value: req.user.empresa_id }
      : { column: 'usuario_id', value: req.user.id };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
  }
}

module.exports = auth;
