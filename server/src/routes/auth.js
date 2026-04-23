const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y password son requeridos' });
    }

    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciales invalidas' });
    }

    const user = result.rows[0];

    if (user.estado !== 'activo') {
      return res.status(403).json({ success: false, error: 'Cuenta inactiva' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Credenciales invalidas' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        rol: user.rol,
        igv_rate: parseFloat(user.igv_rate) || 0.18,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
          empresa: user.empresa,
          igv_rate: user.igv_rate,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', auth, async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ success: false, error: 'Password actual y nueva son requeridos' });
    }

    if (password_nueva.length < 6) {
      return res.status(400).json({ success: false, error: 'La nueva password debe tener al menos 6 caracteres' });
    }

    const result = await pool.query(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Password actual incorrecta' });
    }

    const hash = await bcrypt.hash(password_nueva, 10);
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );

    return res.json({ success: true, data: { message: 'Password actualizada correctamente' } });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
