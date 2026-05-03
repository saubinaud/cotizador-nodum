const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { recalcularProductosPorInsumo } = require('../services/calculador');
const { getUnidadBase, calcCostoBase } = require('../utils/unidades');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.use(auth);

// GET /api/insumos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM insumos WHERE empresa_id = $1 ORDER BY nombre ASC`,
      [req.eid]
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
      'SELECT * FROM insumos WHERE id = $1 AND empresa_id = $2',
      [req.params.id, req.eid]
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

    // Check for duplicate name (DB has UNIQUE constraint on usuario_id + nombre)
    const dup = await pool.query(
      `SELECT id FROM insumos WHERE LOWER(nombre) = LOWER($1) AND usuario_id = $2`,
      [nombreNorm, req.user.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Ya existe un insumo llamado "${nombreNorm}". Usa otro nombre o edita el existente.`,
      });
    }

    const um = unidad_medida || 'g';
    const ub = getUnidadBase(um);
    const cb = calcCostoBase(precio_presentacion, cantidad_presentacion, um);

    const result = await pool.query(
      `INSERT INTO insumos (usuario_id, empresa_id, nombre, unidad_medida, cantidad_presentacion, precio_presentacion, unidad_base, costo_base)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.uid, req.eid, nombreNorm, um, cantidad_presentacion, precio_presentacion, ub, cb]
    );

    logAudit({ userId: req.uid, entidad: 'insumo', entidadId: result.rows[0].id, accion: 'crear', descripcion: `Creo insumo "${nombreNorm}"` });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.constraint === 'insumos_usuario_id_nombre_key') {
      return res.status(409).json({ success: false, error: 'Ya existe un insumo con ese nombre.' });
    }
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
      'SELECT precio_presentacion, cantidad_presentacion FROM insumos WHERE id = $1 AND empresa_id = $2',
      [req.params.id, req.eid]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    // Recalculate base cost
    const effUm = unidad_medida || existing.rows[0].unidad_medida || 'g';
    const effCant = cantidad_presentacion || existing.rows[0].cantidad_presentacion;
    const effPrecio = precio_presentacion || existing.rows[0].precio_presentacion;
    const ub = getUnidadBase(effUm);
    const cb = calcCostoBase(effPrecio, effCant, effUm);

    const result = await pool.query(
      `UPDATE insumos SET
        nombre = COALESCE($1, nombre),
        unidad_medida = COALESCE($2, unidad_medida),
        cantidad_presentacion = COALESCE($3, cantidad_presentacion),
        precio_presentacion = COALESCE($4, precio_presentacion),
        unidad_base = $7,
        costo_base = $8,
        updated_at = NOW()
       WHERE id = $5 AND empresa_id = $6
       RETURNING *`,
      [nombre, unidad_medida, cantidad_presentacion, precio_presentacion, req.params.id, req.eid, ub, cb]
    );

    const old = existing.rows[0];
    const priceChanged = (precio_presentacion && parseFloat(precio_presentacion) !== parseFloat(old.precio_presentacion))
      || (cantidad_presentacion && parseFloat(cantidad_presentacion) !== parseFloat(old.cantidad_presentacion));

    let recalculated = [];
    if (priceChanged) {
      recalculated = await recalcularProductosPorInsumo(pool, req.params.id, req.user.id);
    }

    logAudit({ userId: req.uid, entidad: 'insumo', entidadId: req.params.id, accion: 'editar', descripcion: `Edito insumo "${nombre || 'ID ' + req.params.id}"` });

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
       WHERE ppi.insumo_id = $1 AND prod.empresa_id = $2`,
      [req.params.id, req.eid]
    );
    if (parseInt(usageProductos.rows[0].count) > 0) {
      // Get product names for helpful message
      const prodNames = await pool.query(
        `SELECT DISTINCT prod.nombre FROM producto_prep_insumos ppi
         JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id
         JOIN productos prod ON prod.id = pp.producto_id
         WHERE ppi.insumo_id = $1 AND prod.empresa_id = $2 LIMIT 3`,
        [req.params.id, req.eid]
      );
      const nombres = prodNames.rows.map(r => r.nombre).join(', ');
      return res.status(409).json({
        success: false,
        error: `Este insumo esta en uso en: ${nombres}. Retiralo de esos productos antes de eliminarlo.`,
      });
    }

    // Check usage in predeterminadas
    const usagePred = await pool.query(
      `SELECT COUNT(*) FROM prep_pred_insumos ppi
       JOIN preparaciones_predeterminadas pp ON pp.id = ppi.preparacion_pred_id
       WHERE ppi.insumo_id = $1 AND pp.empresa_id = $2`,
      [req.params.id, req.eid]
    );
    if (parseInt(usagePred.rows[0].count) > 0) {
      const predNames = await pool.query(
        `SELECT DISTINCT pp.nombre FROM prep_pred_insumos ppi
         JOIN preparaciones_predeterminadas pp ON pp.id = ppi.preparacion_pred_id
         WHERE ppi.insumo_id = $1 AND pp.empresa_id = $2 LIMIT 3`,
        [req.params.id, req.eid]
      );
      const nombres = predNames.rows.map(r => r.nombre).join(', ');
      return res.status(409).json({
        success: false,
        error: `Este insumo esta en uso en recetas: ${nombres}. Retiralo de esas recetas antes de eliminarlo.`,
      });
    }

    const result = await pool.query(
      'DELETE FROM insumos WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    logAudit({ userId: req.uid, entidad: 'insumo', entidadId: req.params.id, accion: 'eliminar', descripcion: `Elimino insumo #${req.params.id}` });

    return res.json({ success: true, data: { message: 'Insumo eliminado' } });
  } catch (err) {
    console.error('Delete insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
