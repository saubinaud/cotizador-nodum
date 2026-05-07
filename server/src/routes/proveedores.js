const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/proveedores — List active proveedores
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE empresa_id = $1 AND activo = true ORDER BY nombre',
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List proveedores error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/proveedores — Create proveedor
router.post('/', async (req, res) => {
  try {
    const { nombre, ruc, contacto, email, telefono, direccion, notas } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre es requerido' });

    const result = await pool.query(
      `INSERT INTO proveedores (empresa_id, created_by, nombre, ruc, contacto, email, telefono, direccion, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.eid, req.uid, nombre, ruc || null, contacto || null, email || null, telefono || null, direccion || null, notas || null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create proveedor error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/proveedores/:id — Update proveedor
router.put('/:id', async (req, res) => {
  try {
    const { nombre, ruc, contacto, email, telefono, direccion, notas } = req.body;
    const result = await pool.query(
      `UPDATE proveedores SET
        nombre = COALESCE($1, nombre),
        ruc = COALESCE($2, ruc),
        contacto = COALESCE($3, contacto),
        email = COALESCE($4, email),
        telefono = COALESCE($5, telefono),
        direccion = COALESCE($6, direccion),
        notas = COALESCE($7, notas),
        updated_at = NOW()
       WHERE id = $8 AND empresa_id = $9 RETURNING *`,
      [nombre, ruc, contacto, email, telefono, direccion, notas, req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update proveedor error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/proveedores/:id — Soft delete (activo=false)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE proveedores SET activo = false, updated_at = NOW() WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    return res.json({ success: true, data: { message: 'Proveedor eliminado' } });
  } catch (err) {
    console.error('Delete proveedor error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
