const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/clientes — list user's clients
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clientes WHERE usuario_id = $1 ORDER BY razon_social, num_doc',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List clientes error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/clientes/buscar?q=12345678 — search by doc number
router.get('/buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json({ success: true, data: [] });

    const result = await pool.query(
      `SELECT * FROM clientes WHERE usuario_id = $1 AND (num_doc ILIKE $2 OR razon_social ILIKE $2) ORDER BY razon_social LIMIT 10`,
      [req.user.id, `%${q}%`]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Search clientes error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/clientes
router.post('/', async (req, res) => {
  try {
    const { tipo_doc, num_doc, razon_social, direccion, email, telefono } = req.body;
    if (!num_doc) return res.status(400).json({ success: false, error: 'Numero de documento requerido' });

    // Upsert: update if exists, insert if not
    const existing = await pool.query(
      'SELECT id FROM clientes WHERE usuario_id = $1 AND num_doc = $2',
      [req.user.id, num_doc]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE clientes SET tipo_doc = COALESCE($1, tipo_doc), razon_social = COALESCE($2, razon_social),
         direccion = $3, email = $4, telefono = $5
         WHERE id = $6 RETURNING *`,
        [tipo_doc || '1', razon_social, direccion || null, email || null, telefono || null, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO clientes (usuario_id, tipo_doc, num_doc, razon_social, direccion, email, telefono)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, tipo_doc || '1', num_doc, razon_social || null, direccion || null, email || null, telefono || null]
      );
    }

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create cliente error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  try {
    const { tipo_doc, num_doc, razon_social, direccion, email, telefono } = req.body;
    const result = await pool.query(
      `UPDATE clientes SET
        tipo_doc = COALESCE($1, tipo_doc), num_doc = COALESCE($2, num_doc),
        razon_social = COALESCE($3, razon_social), direccion = $4, email = $5, telefono = $6
       WHERE id = $7 AND usuario_id = $8 RETURNING *`,
      [tipo_doc, num_doc, razon_social, direccion || null, email || null, telefono || null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update cliente error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM clientes WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    return res.json({ success: true, data: { message: 'Cliente eliminado' } });
  } catch (err) {
    console.error('Delete cliente error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
