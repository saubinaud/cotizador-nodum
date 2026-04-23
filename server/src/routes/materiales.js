const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { recalcularProductosPorMaterial } = require('../services/calculador');

const router = express.Router();

router.use(auth);

// GET /api/materiales
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM materiales_empaque WHERE usuario_id = $1 ORDER BY nombre ASC',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List materiales error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/materiales/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM materiales_empaque WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Material no encontrado' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/materiales
router.post('/', async (req, res) => {
  try {
    const { nombre, categoria, unidad_medida, cantidad_presentacion, precio_presentacion, proveedor } = req.body;

    if (!nombre || !cantidad_presentacion || !precio_presentacion) {
      return res.status(400).json({ success: false, error: 'Nombre, cantidad_presentacion y precio_presentacion son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO materiales_empaque (usuario_id, nombre, categoria, unidad_medida, cantidad_presentacion, precio_presentacion, proveedor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, nombre, categoria || null, unidad_medida || null, cantidad_presentacion, precio_presentacion, proveedor || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/materiales/:id
router.put('/:id', async (req, res) => {
  try {
    const { nombre, categoria, unidad_medida, cantidad_presentacion, precio_presentacion, proveedor } = req.body;

    const existing = await pool.query(
      'SELECT precio_presentacion, cantidad_presentacion FROM materiales_empaque WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Material no encontrado' });
    }

    const result = await pool.query(
      `UPDATE materiales_empaque SET
        nombre = COALESCE($1, nombre),
        categoria = COALESCE($2, categoria),
        unidad_medida = COALESCE($3, unidad_medida),
        cantidad_presentacion = COALESCE($4, cantidad_presentacion),
        precio_presentacion = COALESCE($5, precio_presentacion),
        proveedor = COALESCE($6, proveedor),
        updated_at = NOW()
       WHERE id = $7 AND usuario_id = $8
       RETURNING *`,
      [nombre, categoria, unidad_medida, cantidad_presentacion, precio_presentacion, proveedor, req.params.id, req.user.id]
    );

    const old = existing.rows[0];
    const priceChanged = (precio_presentacion && parseFloat(precio_presentacion) !== parseFloat(old.precio_presentacion))
      || (cantidad_presentacion && parseFloat(cantidad_presentacion) !== parseFloat(old.cantidad_presentacion));

    let recalculated = [];
    if (priceChanged) {
      recalculated = await recalcularProductosPorMaterial(pool, req.params.id, req.user.id);
    }

    return res.json({
      success: true,
      data: result.rows[0],
      recalculated: recalculated.length > 0 ? recalculated : undefined,
    });
  } catch (err) {
    console.error('Update material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/materiales/:id
router.delete('/:id', async (req, res) => {
  try {
    const usage = await pool.query(
      `SELECT COUNT(*) FROM producto_materiales pm
       JOIN productos p ON p.id = pm.producto_id
       WHERE pm.material_id = $1 AND p.usuario_id = $2`,
      [req.params.id, req.user.id]
    );

    if (parseInt(usage.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el material esta en uso en productos',
      });
    }

    const result = await pool.query(
      'DELETE FROM materiales_empaque WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Material no encontrado' });
    }

    return res.json({ success: true, data: { message: 'Material eliminado' } });
  } catch (err) {
    console.error('Delete material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
