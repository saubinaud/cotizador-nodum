const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// GET /api/historial/productos/:id/versiones — list all versions for a product
router.get('/productos/:id/versiones', async (req, res) => {
  try {
    // Verify ownership
    const prod = await pool.query(
      'SELECT id FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (prod.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const result = await pool.query(
      `SELECT id, version, motivo, created_at
       FROM producto_versiones
       WHERE producto_id = $1
       ORDER BY version DESC`,
      [req.params.id]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List versions error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/historial/productos/:id/versiones/:version — get specific version snapshot
router.get('/productos/:id/versiones/:version', async (req, res) => {
  try {
    const prod = await pool.query(
      'SELECT id FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (prod.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const result = await pool.query(
      `SELECT * FROM producto_versiones
       WHERE producto_id = $1 AND version = $2`,
      [req.params.id, req.params.version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Version no encontrada' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get version error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/historial/actividad — recent activity log for user
router.get('/actividad', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const result = await pool.query(
      `SELECT pv.id, pv.producto_id, pv.version, pv.motivo, pv.created_at,
              p.nombre AS producto_nombre
       FROM producto_versiones pv
       JOIN productos p ON p.id = pv.producto_id
       WHERE p.usuario_id = $1
       ORDER BY pv.created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Activity log error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
