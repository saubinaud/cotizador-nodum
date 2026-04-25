const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { recalcularProductosPorInsumo } = require('../services/calculador');

const router = express.Router();

router.use(auth);

// GET /api/insumos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM insumos WHERE usuario_id = $1 ORDER BY nombre ASC`,
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List insumos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/insumos/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM insumos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/insumos
router.post('/', async (req, res) => {
  try {
    const { nombre, unidad_medida, cantidad_presentacion, precio_presentacion } = req.body;

    if (!nombre || !cantidad_presentacion || !precio_presentacion) {
      return res.status(400).json({ success: false, error: 'Nombre, cantidad_presentacion y precio_presentacion son requeridos' });
    }

    const nombreNorm = nombre.trim().charAt(0).toUpperCase() + nombre.trim().slice(1).toLowerCase();

    // Check for exact duplicate (same name + same presentation)
    const dup = await pool.query(
      `SELECT id FROM insumos
       WHERE LOWER(nombre) = LOWER($1) AND usuario_id = $2
       AND cantidad_presentacion = $3 AND unidad_medida = $4`,
      [nombreNorm, req.user.id, cantidad_presentacion, unidad_medida || 'g']
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Ya existe "${nombreNorm}" con la misma presentacion (${cantidad_presentacion} ${unidad_medida || 'g'})`,
      });
    }

    const result = await pool.query(
      `INSERT INTO insumos (usuario_id, nombre, unidad_medida, cantidad_presentacion, precio_presentacion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, nombreNorm, unidad_medida || 'g', cantidad_presentacion, precio_presentacion]
    );

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'insumo', result.rows[0].id, 'crear', JSON.stringify({ nombre })]); } catch (_) {}

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/insumos/:id
router.put('/:id', async (req, res) => {
  try {
    let { nombre, unidad_medida, cantidad_presentacion, precio_presentacion } = req.body;

    if (nombre) {
      nombre = nombre.trim().charAt(0).toUpperCase() + nombre.trim().slice(1).toLowerCase();
    }

    const existing = await pool.query(
      'SELECT precio_presentacion, cantidad_presentacion FROM insumos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    const result = await pool.query(
      `UPDATE insumos SET
        nombre = COALESCE($1, nombre),
        unidad_medida = COALESCE($2, unidad_medida),
        cantidad_presentacion = COALESCE($3, cantidad_presentacion),
        precio_presentacion = COALESCE($4, precio_presentacion),
        updated_at = NOW()
       WHERE id = $5 AND usuario_id = $6
       RETURNING *`,
      [nombre, unidad_medida, cantidad_presentacion, precio_presentacion, req.params.id, req.user.id]
    );

    const old = existing.rows[0];
    const priceChanged = (precio_presentacion && parseFloat(precio_presentacion) !== parseFloat(old.precio_presentacion))
      || (cantidad_presentacion && parseFloat(cantidad_presentacion) !== parseFloat(old.cantidad_presentacion));

    let recalculated = [];
    if (priceChanged) {
      recalculated = await recalcularProductosPorInsumo(pool, req.params.id, req.user.id);
    }

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'insumo', req.params.id, 'actualizar', JSON.stringify({ nombre, unidad_medida, cantidad_presentacion, precio_presentacion })]); } catch (_) {}

    return res.json({
      success: true,
      data: result.rows[0],
      recalculated: recalculated.length > 0 ? recalculated : undefined,
    });
  } catch (err) {
    console.error('Update insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/insumos/:id
router.delete('/:id', async (req, res) => {
  try {
    // Check usage in products
    const usageProductos = await pool.query(
      `SELECT COUNT(*) FROM producto_prep_insumos ppi
       JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id
       JOIN productos prod ON prod.id = pp.producto_id
       WHERE ppi.insumo_id = $1 AND prod.usuario_id = $2`,
      [req.params.id, req.user.id]
    );
    if (parseInt(usageProductos.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el insumo esta en uso en productos',
      });
    }

    // Check usage in predeterminadas
    const usagePred = await pool.query(
      `SELECT COUNT(*) FROM prep_pred_insumos ppi
       JOIN preparaciones_predeterminadas pp ON pp.id = ppi.preparacion_pred_id
       WHERE ppi.insumo_id = $1 AND pp.usuario_id = $2`,
      [req.params.id, req.user.id]
    );
    if (parseInt(usagePred.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el insumo esta en uso en preparaciones predeterminadas',
      });
    }

    const result = await pool.query(
      'DELETE FROM insumos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'insumo', req.params.id, 'eliminar', null]); } catch (_) {}

    return res.json({ success: true, data: { message: 'Insumo eliminado' } });
  } catch (err) {
    console.error('Delete insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
