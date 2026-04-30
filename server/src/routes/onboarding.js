const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../models/db');

const router = express.Router();

// GET /api/onboarding/validar?token=xxx — validate onboarding token
router.get('/validar', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token requerido' });
    }

    const result = await pool.query(
      `SELECT id, email, nombre, nombre_comercial, onboarding_token_expires
       FROM usuarios
       WHERE onboarding_token = $1 AND estado = 'pendiente'`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Token invalido o ya utilizado' });
    }

    const user = result.rows[0];

    if (new Date(user.onboarding_token_expires) < new Date()) {
      return res.status(410).json({ success: false, error: 'Token expirado' });
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        empresa: user.nombre_comercial,
      },
    });
  } catch (err) {
    console.error('Validate token error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/onboarding/consulta-ruc/:ruc — query PeruAPI for RUC data
router.get('/consulta-ruc/:ruc', async (req, res) => {
  try {
    const { ruc } = req.params;

    if (!ruc || ruc.length !== 11) {
      return res.status(400).json({ success: false, error: 'RUC debe tener 11 digitos' });
    }

    const response = await fetch(`https://api.peruapi.com/ruc/${ruc}`, {
      headers: {
        Authorization: `Bearer ${process.env.PERUAPI_KEY}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'Error consultando RUC' });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Consulta RUC error:', err);
    return res.status(500).json({ success: false, error: 'Error consultando RUC' });
  }
});

// POST /api/onboarding/completar — complete onboarding (set password, RUC, etc.)
router.post('/completar', async (req, res) => {
  try {
    const { token, password, ruc, razon_social, direccion, igv_rate: rawIgv, pais, tipo_negocio, giro_negocio_id } = req.body;
    // Frontend may send 18 (integer %) or 0.18 (decimal). DB needs decimal.
    // If informal, IGV is always 0.
    const igv_rate = tipo_negocio === 'informal' ? 0 : (rawIgv ? (Number(rawIgv) > 1 ? Number(rawIgv) / 100 : Number(rawIgv)) : 0.18);

    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token y password son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'La password debe tener al menos 6 caracteres' });
    }

    const result = await pool.query(
      `SELECT id, onboarding_token_expires FROM usuarios
       WHERE onboarding_token = $1 AND estado = 'pendiente'`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Token invalido o ya utilizado' });
    }

    const user = result.rows[0];

    if (new Date(user.onboarding_token_expires) < new Date()) {
      return res.status(410).json({ success: false, error: 'Token expirado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE usuarios SET
        password_hash = $1,
        ruc = $2,
        razon_social = $3,
        igv_rate = $4,
        pais_code = $5,
        tipo_negocio = $6,
        giro_negocio_id = $7,
        estado = 'activo',
        onboarding_token = NULL,
        onboarding_token_expires = NULL,
        onboarding_completed_at = NOW(),
        updated_at = NOW()
       WHERE id = $8`,
      [
        password_hash,
        ruc || null,
        razon_social || null,
        igv_rate,
        pais || 'PE',
        tipo_negocio || 'formal',
        giro_negocio_id || null,
        user.id,
      ]
    );

    // TODO: Send confirmation email via Notifuse or SMTP
    // await sendEmail(user.email, 'Bienvenido a Kudi', '...');

    return res.json({ success: true, data: { message: 'Onboarding completado. Ya puedes iniciar sesion.' } });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
