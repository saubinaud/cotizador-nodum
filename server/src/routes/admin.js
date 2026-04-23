const express = require('express');
const crypto = require('crypto');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');

const router = express.Router();

router.use(auth);
router.use(requireRole('admin'));

// POST /api/admin/usuarios — create client with onboarding token
router.post('/usuarios', async (req, res) => {
  try {
    const { email, nombre, empresa: nombre_comercial, rol } = req.body;
    const validRol = ['cliente', 'admin'].includes(rol) ? rol : 'cliente';

    if (!email || !nombre) {
      return res.status(400).json({ success: false, error: 'Email y nombre son requeridos' });
    }

    // Check duplicate
    const existing = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'El email ya esta registrado' });
    }

    const onboarding_token = crypto.randomBytes(32).toString('hex');
    const onboarding_expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      `INSERT INTO usuarios (email, nombre, nombre_comercial, rol, estado, onboarding_token, onboarding_token_expires, password_hash)
       VALUES ($1, $2, $3, $4, 'pendiente', $5, $6, '')
       RETURNING id, email, nombre, nombre_comercial AS empresa, rol, estado, onboarding_token, onboarding_token_expires, created_at`,
      [email.toLowerCase().trim(), nombre, nombre_comercial || null, validRol, onboarding_token, onboarding_expira]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/admin/usuarios — list all users
router.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, nombre, nombre_comercial AS empresa, rol, estado, ruc, igv_rate, created_at, updated_at
       FROM usuarios
       ORDER BY created_at DESC`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PATCH /api/admin/usuarios/:id/estado — toggle user state
router.patch('/usuarios/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !['activo', 'inactivo', 'pendiente'].includes(estado)) {
      return res.status(400).json({ success: false, error: 'Estado invalido. Opciones: activo, inactivo, pendiente' });
    }

    const result = await pool.query(
      `UPDATE usuarios SET estado = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, nombre, estado`,
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update estado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/admin/actividad — activity log
router.get('/actividad', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT al.*, u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM actividad_log al
       LEFT JOIN usuarios u ON u.id = al.usuario_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Activity log error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
