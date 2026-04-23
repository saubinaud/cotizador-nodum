const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// ==================== PREPARACIONES PREDETERMINADAS ====================

// GET /api/predeterminados/preparaciones
router.get('/preparaciones', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM preparaciones_predeterminadas WHERE usuario_id = $1 ORDER BY nombre ASC',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List prep predeterminadas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/predeterminados/preparaciones
router.post('/preparaciones', async (req, res) => {
  try {
    const { nombre, insumos } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    const result = await pool.query(
      `INSERT INTO preparaciones_predeterminadas (usuario_id, nombre, insumos)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, nombre, JSON.stringify(insumos || [])]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/predeterminados/preparaciones/:id
router.put('/preparaciones/:id', async (req, res) => {
  try {
    const { nombre, insumos } = req.body;

    const result = await pool.query(
      `UPDATE preparaciones_predeterminadas SET
        nombre = COALESCE($1, nombre),
        insumos = COALESCE($2, insumos),
        updated_at = NOW()
       WHERE id = $3 AND usuario_id = $4
       RETURNING *`,
      [nombre, insumos ? JSON.stringify(insumos) : null, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Preparacion predeterminada no encontrada' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/predeterminados/preparaciones/:id
router.delete('/preparaciones/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM preparaciones_predeterminadas WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Preparacion predeterminada no encontrada' });
    }

    return res.json({ success: true, data: { message: 'Preparacion predeterminada eliminada' } });
  } catch (err) {
    console.error('Delete prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ==================== EMPAQUES PREDETERMINADOS ====================

// GET /api/predeterminados/empaques
router.get('/empaques', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM empaques_predeterminados WHERE usuario_id = $1 ORDER BY nombre ASC',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List empaques predeterminados error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/predeterminados/empaques
router.post('/empaques', async (req, res) => {
  try {
    const { nombre, materiales } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    const result = await pool.query(
      `INSERT INTO empaques_predeterminados (usuario_id, nombre, materiales)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, nombre, JSON.stringify(materiales || [])]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/predeterminados/empaques/:id
router.put('/empaques/:id', async (req, res) => {
  try {
    const { nombre, materiales } = req.body;

    const result = await pool.query(
      `UPDATE empaques_predeterminados SET
        nombre = COALESCE($1, nombre),
        materiales = COALESCE($2, materiales),
        updated_at = NOW()
       WHERE id = $3 AND usuario_id = $4
       RETURNING *`,
      [nombre, materiales ? JSON.stringify(materiales) : null, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Empaque predeterminado no encontrado' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/predeterminados/empaques/:id
router.delete('/empaques/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM empaques_predeterminados WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Empaque predeterminado no encontrado' });
    }

    return res.json({ success: true, data: { message: 'Empaque predeterminado eliminado' } });
  } catch (err) {
    console.error('Delete empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
