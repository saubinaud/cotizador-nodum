const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/paises — public, returns countries from DB
router.get('/paises', async (_req, res) => {
  try {
    const result = await pool.query('SELECT code, nombre, moneda, simbolo, igv_default FROM paises ORDER BY nombre');
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Paises error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

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

    // Get pais data
    const paisData = await pool.query('SELECT moneda, simbolo FROM paises WHERE code = $1', [user.pais_code || user.pais || 'PE']);
    const pais = paisData.rows[0] || { moneda: 'PEN', simbolo: 'S/' };

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
          empresa: user.nombre_comercial,
          igv_rate: user.igv_rate,
          ruc: user.ruc,
          razon_social: user.razon_social,
          permisos: user.permisos,
          pais: user.pais_code || user.pais,
          moneda: pais.moneda,
          simbolo: pais.simbolo,
          logo_url: user.logo_url,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.nombre, u.rol, u.nombre_comercial AS empresa, u.igv_rate, u.ruc, u.razon_social, u.permisos,
              u.pais_code AS pais, p.moneda, p.simbolo, u.logo_url
       FROM usuarios u LEFT JOIN paises p ON p.code = u.pais_code WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    return res.json({ success: true, data: { user: result.rows[0] } });
  } catch (err) {
    console.error('Auth me error:', err);
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

// PUT /api/auth/perfil
router.put('/perfil', auth, async (req, res) => {
  try {
    const { nombre, nombre_comercial, ruc, razon_social, igv_rate: rawIgv, pais } = req.body;
    const igvDecimal = rawIgv != null ? (Number(rawIgv) > 1 ? Number(rawIgv) / 100 : Number(rawIgv)) : null;

    const result = await pool.query(
      `UPDATE usuarios SET
        nombre = COALESCE($1, nombre),
        nombre_comercial = COALESCE($2, nombre_comercial),
        ruc = COALESCE($3, ruc),
        razon_social = COALESCE($4, razon_social),
        igv_rate = COALESCE($5::numeric, igv_rate),
        pais_code = COALESCE($6, pais_code),
        updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, nombre, rol, nombre_comercial AS empresa, igv_rate, ruc, razon_social, permisos, pais_code AS pais, logo_url`,
      [nombre || null, nombre_comercial || null, ruc || null, razon_social || null, igvDecimal, pais || null, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    // If IGV changed, cascade to all products
    if (igvDecimal != null) {
      await pool.query(
        `UPDATE productos SET
          igv_rate = $1::numeric,
          precio_final = ROUND(precio_venta * (1 + $1::numeric), 4),
          updated_at = NOW()
         WHERE usuario_id = $2`,
        [igvDecimal, req.user.id]
      );
    }

    const paisInfo = await pool.query('SELECT moneda, simbolo FROM paises WHERE code = $1', [result.rows[0].pais || 'PE']);
    const enriched = { ...result.rows[0], moneda: paisInfo.rows[0]?.moneda || 'PEN', simbolo: paisInfo.rows[0]?.simbolo || 'S/' };
    return res.json({ success: true, data: { user: enriched } });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/auth/logo
router.post('/logo', auth, async (req, res) => {
  try {
    const { image } = req.body; // base64 string
    if (!image) return res.status(400).json({ success: false, error: 'Imagen requerida' });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ success: false, error: 'Cloudinary no configurado' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha1')
      .update(`folder=nodum_logos&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    const formData = new URLSearchParams();
    formData.append('file', image);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'nodum_logos');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!data.secure_url) {
      return res.status(500).json({ success: false, error: 'Error subiendo imagen' });
    }

    await pool.query(
      'UPDATE usuarios SET logo_url = $1, updated_at = NOW() WHERE id = $2',
      [data.secure_url, req.user.id]
    );

    return res.json({ success: true, data: { logo_url: data.secure_url } });
  } catch (err) {
    console.error('Logo upload error:', err);
    return res.status(500).json({ success: false, error: 'Error subiendo imagen' });
  }
});

module.exports = router;
