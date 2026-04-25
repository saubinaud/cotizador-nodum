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
      'SELECT * FROM materiales WHERE usuario_id = $1 ORDER BY nombre ASC',
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
      'SELECT * FROM materiales WHERE id = $1 AND usuario_id = $2',
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
    const { nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion } = req.body;

    if (!nombre || !cantidad_presentacion || !precio_presentacion) {
      return res.status(400).json({ success: false, error: 'Nombre, cantidad_presentacion y precio_presentacion son requeridos' });
    }

    const nombreNorm = nombre.trim().charAt(0).toUpperCase() + nombre.trim().slice(1).toLowerCase();

    const dup = await pool.query(
      'SELECT id, nombre, cantidad_presentacion, unidad_medida, precio_presentacion FROM materiales WHERE LOWER(nombre) = LOWER($1) AND usuario_id = $2',
      [nombreNorm, req.user.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Ya existe un material llamado "${dup.rows[0].nombre}" (${dup.rows[0].cantidad_presentacion} ${dup.rows[0].unidad_medida})`,
        existing: dup.rows[0],
      });
    }

    const result = await pool.query(
      `INSERT INTO materiales (usuario_id, nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, nombreNorm, proveedor || null, detalle || null, unidad_medida || 'uni', cantidad_presentacion, precio_presentacion]
    );

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'material', result.rows[0].id, 'crear', JSON.stringify({ nombre })]); } catch (_) {}

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/materiales/:id
router.put('/:id', async (req, res) => {
  try {
    let { nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion } = req.body;

    if (nombre) {
      nombre = nombre.trim().charAt(0).toUpperCase() + nombre.trim().slice(1).toLowerCase();
    }

    const existing = await pool.query(
      'SELECT precio_presentacion, cantidad_presentacion FROM materiales WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Material no encontrado' });
    }

    const result = await pool.query(
      `UPDATE materiales SET
        nombre = COALESCE($1, nombre),
        proveedor = COALESCE($2, proveedor),
        detalle = COALESCE($3, detalle),
        unidad_medida = COALESCE($4, unidad_medida),
        cantidad_presentacion = COALESCE($5, cantidad_presentacion),
        precio_presentacion = COALESCE($6, precio_presentacion),
        updated_at = NOW()
       WHERE id = $7 AND usuario_id = $8
       RETURNING *`,
      [nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion, req.params.id, req.user.id]
    );

    const old = existing.rows[0];
    const priceChanged = (precio_presentacion && parseFloat(precio_presentacion) !== parseFloat(old.precio_presentacion))
      || (cantidad_presentacion && parseFloat(cantidad_presentacion) !== parseFloat(old.cantidad_presentacion));

    let recalculated = [];
    if (priceChanged) {
      recalculated = await recalcularProductosPorMaterial(pool, req.params.id, req.user.id);
    }

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'material', req.params.id, 'actualizar', JSON.stringify({ nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion })]); } catch (_) {}

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
    // Check usage in products
    const usageProductos = await pool.query(
      `SELECT COUNT(*) FROM producto_materiales pm
       JOIN productos p ON p.id = pm.producto_id
       WHERE pm.material_id = $1 AND p.usuario_id = $2`,
      [req.params.id, req.user.id]
    );
    if (parseInt(usageProductos.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el material esta en uso en productos',
      });
    }

    // Check usage in empaques predeterminados
    const usagePred = await pool.query(
      `SELECT COUNT(*) FROM empaque_pred_materiales epm
       JOIN empaques_predeterminados ep ON ep.id = epm.empaque_pred_id
       WHERE epm.material_id = $1 AND ep.usuario_id = $2`,
      [req.params.id, req.user.id]
    );
    if (parseInt(usagePred.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el material esta en uso en empaques predeterminados',
      });
    }

    const result = await pool.query(
      'DELETE FROM materiales WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Material no encontrado' });
    }

    try { await pool.query('INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'material', req.params.id, 'eliminar', null]); } catch (_) {}

    return res.json({ success: true, data: { message: 'Material eliminado' } });
  } catch (err) {
    console.error('Delete material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
