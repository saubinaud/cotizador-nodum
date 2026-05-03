const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { getDateRange } = require('../utils/dateRange');

const router = express.Router();
router.use(auth);

// ==================== HELPERS ====================

async function recalcMermaInsumo(insumoId) {
  const res = await pool.query(
    'SELECT merma_pct FROM mediciones_merma_insumo WHERE insumo_id = $1 ORDER BY fecha DESC, created_at DESC LIMIT 5',
    [insumoId]
  );
  if (res.rows.length === 0) {
    await pool.query('UPDATE insumos SET merma_pct = 0 WHERE id = $1', [insumoId]);
    return;
  }
  const avg = res.rows.reduce((s, r) => s + parseFloat(r.merma_pct), 0) / res.rows.length;
  await pool.query('UPDATE insumos SET merma_pct = $1 WHERE id = $2', [Math.round(avg * 100) / 100, insumoId]);
}

async function recalcMermaPrep(prepId) {
  const res = await pool.query(
    'SELECT merma_pct FROM mediciones_merma_preparacion WHERE preparacion_pred_id = $1 ORDER BY fecha DESC, created_at DESC LIMIT 5',
    [prepId]
  );
  if (res.rows.length === 0) {
    await pool.query('UPDATE preparaciones_predeterminadas SET merma_pct = 0 WHERE id = $1', [prepId]);
    return;
  }
  const avg = res.rows.reduce((s, r) => s + parseFloat(r.merma_pct), 0) / res.rows.length;
  await pool.query('UPDATE preparaciones_predeterminadas SET merma_pct = $1 WHERE id = $2', [Math.round(avg * 100) / 100, prepId]);
}

// ==================== MERMA DE INSUMOS ====================

// GET /api/perdidas/mermas/insumos — list all measurements for user
router.get('/mermas/insumos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, i.nombre AS insumo_nombre
       FROM mediciones_merma_insumo m
       JOIN insumos i ON i.id = m.insumo_id
       WHERE i.empresa_id = $1
       ORDER BY m.fecha DESC, m.created_at DESC`,
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List mermas insumos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/perdidas/mermas/insumos/:insumoId — latest 10 for specific insumo
router.get('/mermas/insumos/:insumoId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, i.nombre AS insumo_nombre
       FROM mediciones_merma_insumo m
       JOIN insumos i ON i.id = m.insumo_id
       WHERE m.insumo_id = $1 AND i.empresa_id = $2
       ORDER BY m.fecha DESC, m.created_at DESC LIMIT 10`,
      [req.params.insumoId, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get merma insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/mermas/insumos — create measurement
router.post('/mermas/insumos', async (req, res) => {
  try {
    const { insumo_id, merma_pct, causa, fecha, notas } = req.body;
    if (!insumo_id || merma_pct == null || !fecha) {
      return res.status(400).json({ success: false, error: 'insumo_id, merma_pct y fecha requeridos' });
    }

    // Verify ownership
    const insumo = await pool.query('SELECT id FROM insumos WHERE id = $1 AND empresa_id = $2', [insumo_id, req.eid]);
    if (insumo.rows.length === 0) return res.status(404).json({ success: false, error: 'Insumo no encontrado' });

    const result = await pool.query(
      `INSERT INTO mediciones_merma_insumo (usuario_id, empresa_id, insumo_id, merma_pct, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.uid, req.eid, insumo_id, merma_pct, causa || null, fecha, notas || null]
    );

    // Recalculate average merma from last 5 measurements
    await recalcMermaInsumo(insumo_id);

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create merma insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/mermas/insumos/:id
router.delete('/mermas/insumos/:id', async (req, res) => {
  try {
    // Get insumo_id before deleting for recalc
    const existing = await pool.query(
      `SELECT m.id, m.insumo_id FROM mediciones_merma_insumo m
       JOIN insumos i ON i.id = m.insumo_id
       WHERE m.id = $1 AND i.empresa_id = $2`,
      [req.params.id, req.eid]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Medicion no encontrada' });

    const insumoId = existing.rows[0].insumo_id;
    await pool.query('DELETE FROM mediciones_merma_insumo WHERE id = $1', [req.params.id]);

    // Recalculate average
    await recalcMermaInsumo(insumoId);

    return res.json({ success: true, data: { message: 'Medicion eliminada' } });
  } catch (err) {
    console.error('Delete merma insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== MERMA DE PREPARACIONES ====================

// GET /api/perdidas/mermas/preparaciones — list all for user
router.get('/mermas/preparaciones', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, pp.nombre AS preparacion_nombre
       FROM mediciones_merma_preparacion m
       JOIN preparaciones_predeterminadas pp ON pp.id = m.preparacion_pred_id
       WHERE pp.empresa_id = $1
       ORDER BY m.fecha DESC, m.created_at DESC`,
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List mermas preparaciones error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/perdidas/mermas/preparaciones/:prepId — latest 10 for specific prep
router.get('/mermas/preparaciones/:prepId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, pp.nombre AS preparacion_nombre
       FROM mediciones_merma_preparacion m
       JOIN preparaciones_predeterminadas pp ON pp.id = m.preparacion_pred_id
       WHERE m.preparacion_pred_id = $1 AND pp.empresa_id = $2
       ORDER BY m.fecha DESC, m.created_at DESC LIMIT 10`,
      [req.params.prepId, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get merma preparacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/mermas/preparaciones — create measurement
router.post('/mermas/preparaciones', async (req, res) => {
  try {
    const { preparacion_pred_id, tanda_producida, cantidad_util, cantidad_descartada, causa, fecha, notas } = req.body;
    if (!preparacion_pred_id || !tanda_producida || cantidad_descartada == null || !fecha) {
      return res.status(400).json({ success: false, error: 'preparacion_pred_id, tanda_producida, cantidad_descartada y fecha requeridos' });
    }

    // Verify ownership
    const prep = await pool.query('SELECT id FROM preparaciones_predeterminadas WHERE id = $1 AND empresa_id = $2', [preparacion_pred_id, req.eid]);
    if (prep.rows.length === 0) return res.status(404).json({ success: false, error: 'Preparacion no encontrada' });

    // Auto-calculate merma_pct
    const merma_pct = (parseFloat(cantidad_descartada) / parseFloat(tanda_producida)) * 100;

    const result = await pool.query(
      `INSERT INTO mediciones_merma_preparacion (preparacion_pred_id, tanda_producida, cantidad_util, cantidad_descartada, merma_pct, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [preparacion_pred_id, tanda_producida, cantidad_util || null, cantidad_descartada, Math.round(merma_pct * 100) / 100, causa || null, fecha, notas || null]
    );

    // Recalculate average merma from last 5 measurements
    await recalcMermaPrep(preparacion_pred_id);

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create merma preparacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/mermas/preparaciones/:id
router.delete('/mermas/preparaciones/:id', async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT m.id, m.preparacion_pred_id FROM mediciones_merma_preparacion m
       JOIN preparaciones_predeterminadas pp ON pp.id = m.preparacion_pred_id
       WHERE m.id = $1 AND pp.empresa_id = $2`,
      [req.params.id, req.eid]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Medicion no encontrada' });

    const prepId = existing.rows[0].preparacion_pred_id;
    await pool.query('DELETE FROM mediciones_merma_preparacion WHERE id = $1', [req.params.id]);

    await recalcMermaPrep(prepId);

    return res.json({ success: true, data: { message: 'Medicion eliminada' } });
  } catch (err) {
    console.error('Delete merma preparacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== DESMEDRO DE PRODUCTOS ====================

// GET /api/perdidas/desmedros/resumen?year=X&month=Y — totals per type for P&L (MUST be before /:id-like routes)
router.get('/desmedros/resumen', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const [prodRes, prepRes, insRes, matRes] = await Promise.all([
      pool.query(
        'SELECT COALESCE(SUM(perdida_total), 0) AS total FROM desmedros_producto WHERE fecha >= $1 AND fecha <= $2 AND empresa_id = $3',
        [start, end, req.eid]
      ),
      pool.query(
        'SELECT COALESCE(SUM(perdida_total), 0) AS total FROM desmedros_preparacion WHERE fecha >= $1 AND fecha <= $2 AND empresa_id = $3',
        [start, end, req.eid]
      ),
      pool.query(
        'SELECT COALESCE(SUM(perdida_total), 0) AS total FROM desmedros_insumo WHERE fecha >= $1 AND fecha <= $2 AND empresa_id = $3',
        [start, end, req.eid]
      ),
      pool.query(
        'SELECT COALESCE(SUM(perdida_total), 0) AS total FROM desmedros_material WHERE fecha >= $1 AND fecha <= $2 AND empresa_id = $3',
        [start, end, req.eid]
      ),
    ]);

    const productos = parseFloat(prodRes.rows[0].total);
    const preparaciones = parseFloat(prepRes.rows[0].total);
    const insumos = parseFloat(insRes.rows[0].total);
    const materiales = parseFloat(matRes.rows[0].total);

    return res.json({
      success: true,
      data: {
        productos,
        preparaciones,
        insumos,
        materiales,
        total: Math.round((productos + preparaciones + insumos + materiales) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Desmedros resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/perdidas/desmedros/productos?year=X&month=Y
router.get('/desmedros/productos', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT d.*, p.nombre AS producto_nombre, p.imagen_url AS producto_imagen
       FROM desmedros_producto d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.fecha >= $1 AND d.fecha <= $2 AND d.empresa_id = $3
       ORDER BY d.fecha DESC, d.created_at DESC`,
      [start, end, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List desmedros productos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/desmedros/productos
router.post('/desmedros/productos', async (req, res) => {
  try {
    const { producto_id, unidades, causa, fecha, notas } = req.body;
    if (!producto_id || !unidades || !fecha) {
      return res.status(400).json({ success: false, error: 'producto_id, unidades y fecha requeridos' });
    }

    // Lookup costo_neto snapshot
    const prod = await pool.query('SELECT costo_neto FROM productos WHERE id = $1 AND empresa_id = $2', [producto_id, req.eid]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    const costo_neto_snapshot = parseFloat(prod.rows[0].costo_neto) || 0;

    // Auto-assign periodo for backward compat
    let periodoId = null;
    try {
      const pRes = await pool.query(
        'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.eid, fecha]
      );
      periodoId = pRes.rows[0]?.id || null;
    } catch(_) {}

    const perdida_total = parseInt(unidades) * costo_neto_snapshot;

    const result = await pool.query(
      `INSERT INTO desmedros_producto (usuario_id, empresa_id, producto_id, periodo_id, unidades, costo_neto_snapshot, perdida_total, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.uid, req.eid, producto_id, periodoId, unidades, costo_neto_snapshot, Math.round(perdida_total * 100) / 100, causa || null, fecha, notas || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create desmedro producto error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/desmedros/productos/:id
router.delete('/desmedros/productos/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM desmedros_producto WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Desmedro no encontrado' });
    return res.json({ success: true, data: { message: 'Desmedro eliminado' } });
  } catch (err) {
    console.error('Delete desmedro producto error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== DESMEDRO DE PREPARACIONES ====================

// GET /api/perdidas/desmedros/preparaciones?year=X&month=Y
router.get('/desmedros/preparaciones', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT d.*, pp.nombre AS preparacion_nombre
       FROM desmedros_preparacion d
       JOIN preparaciones_predeterminadas pp ON pp.id = d.preparacion_pred_id
       WHERE d.fecha >= $1 AND d.fecha <= $2 AND d.empresa_id = $3
       ORDER BY d.fecha DESC, d.created_at DESC`,
      [start, end, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List desmedros preparaciones error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/desmedros/preparaciones
router.post('/desmedros/preparaciones', async (req, res) => {
  try {
    const { preparacion_pred_id, costo_total_tanda, causa, fecha, notas } = req.body;
    if (!preparacion_pred_id || !costo_total_tanda || !fecha) {
      return res.status(400).json({ success: false, error: 'preparacion_pred_id, costo_total_tanda y fecha requeridos' });
    }

    // Verify ownership
    const prep = await pool.query('SELECT id FROM preparaciones_predeterminadas WHERE id = $1 AND empresa_id = $2', [preparacion_pred_id, req.eid]);
    if (prep.rows.length === 0) return res.status(404).json({ success: false, error: 'Preparacion no encontrada' });

    // Auto-assign periodo for backward compat
    let periodoId = null;
    try {
      const pRes = await pool.query(
        'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.eid, fecha]
      );
      periodoId = pRes.rows[0]?.id || null;
    } catch(_) {}

    const perdida_total = parseFloat(costo_total_tanda);

    const result = await pool.query(
      `INSERT INTO desmedros_preparacion (usuario_id, empresa_id, preparacion_pred_id, periodo_id, costo_total_tanda, perdida_total, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.uid, req.eid, preparacion_pred_id, periodoId, costo_total_tanda, Math.round(perdida_total * 100) / 100, causa || null, fecha, notas || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create desmedro preparacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/desmedros/preparaciones/:id
router.delete('/desmedros/preparaciones/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM desmedros_preparacion WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Desmedro no encontrado' });
    return res.json({ success: true, data: { message: 'Desmedro eliminado' } });
  } catch (err) {
    console.error('Delete desmedro preparacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== DESMEDRO DE INSUMOS ====================

// GET /api/perdidas/desmedros/insumos?year=X&month=Y
router.get('/desmedros/insumos', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT d.*, i.nombre AS insumo_nombre
       FROM desmedros_insumo d
       JOIN insumos i ON i.id = d.insumo_id
       WHERE d.fecha >= $1 AND d.fecha <= $2 AND d.empresa_id = $3
       ORDER BY d.fecha DESC, d.created_at DESC`,
      [start, end, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List desmedros insumos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/desmedros/insumos
router.post('/desmedros/insumos', async (req, res) => {
  try {
    const { insumo_id, cantidad, unidad, causa, fecha, notas } = req.body;
    if (!insumo_id || !cantidad || !fecha) {
      return res.status(400).json({ success: false, error: 'insumo_id, cantidad y fecha requeridos' });
    }

    // Lookup costo_base snapshot
    const ins = await pool.query('SELECT costo_base FROM insumos WHERE id = $1 AND empresa_id = $2', [insumo_id, req.eid]);
    if (ins.rows.length === 0) return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    const costo_unitario_snapshot = parseFloat(ins.rows[0].costo_base) || 0;

    // Auto-assign periodo for backward compat
    let periodoId = null;
    try {
      const pRes = await pool.query(
        'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.eid, fecha]
      );
      periodoId = pRes.rows[0]?.id || null;
    } catch(_) {}

    const perdida_total = parseFloat(cantidad) * costo_unitario_snapshot;

    const result = await pool.query(
      `INSERT INTO desmedros_insumo (usuario_id, empresa_id, insumo_id, periodo_id, cantidad, unidad, costo_unitario_snapshot, perdida_total, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.uid, req.eid, insumo_id, periodoId, cantidad, unidad || null, costo_unitario_snapshot, Math.round(perdida_total * 100) / 100, causa || null, fecha, notas || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create desmedro insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/desmedros/insumos/:id
router.delete('/desmedros/insumos/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM desmedros_insumo WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Desmedro no encontrado' });
    return res.json({ success: true, data: { message: 'Desmedro eliminado' } });
  } catch (err) {
    console.error('Delete desmedro insumo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== DESMEDRO DE MATERIALES ====================

// GET /api/perdidas/desmedros/materiales?year=X&month=Y
router.get('/desmedros/materiales', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT d.*, m.nombre AS material_nombre
       FROM desmedros_material d
       JOIN materiales m ON m.id = d.material_id
       WHERE d.fecha >= $1 AND d.fecha <= $2 AND d.empresa_id = $3
       ORDER BY d.fecha DESC, d.created_at DESC`,
      [start, end, req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List desmedros materiales error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/perdidas/desmedros/materiales
router.post('/desmedros/materiales', async (req, res) => {
  try {
    const { material_id, cantidad, causa, fecha, notas } = req.body;
    if (!material_id || !cantidad || !fecha) {
      return res.status(400).json({ success: false, error: 'material_id, cantidad y fecha requeridos' });
    }

    // Lookup cost from materiales
    const mat = await pool.query(
      'SELECT precio_presentacion, cantidad_presentacion FROM materiales WHERE id = $1 AND empresa_id = $2',
      [material_id, req.eid]
    );
    if (mat.rows.length === 0) return res.status(404).json({ success: false, error: 'Material no encontrado' });

    const precio = parseFloat(mat.rows[0].precio_presentacion) || 0;
    const cantPres = parseFloat(mat.rows[0].cantidad_presentacion) || 1;
    const costo_unitario_snapshot = cantPres > 0 ? precio / cantPres : 0;

    // Auto-assign periodo for backward compat
    let periodoId = null;
    try {
      const pRes = await pool.query(
        'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.eid, fecha]
      );
      periodoId = pRes.rows[0]?.id || null;
    } catch(_) {}

    const perdida_total = parseFloat(cantidad) * costo_unitario_snapshot;

    const result = await pool.query(
      `INSERT INTO desmedros_material (usuario_id, empresa_id, material_id, periodo_id, cantidad, costo_unitario_snapshot, perdida_total, causa, fecha, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.uid, req.eid, material_id, periodoId, cantidad, Math.round(costo_unitario_snapshot * 100) / 100, Math.round(perdida_total * 100) / 100, causa || null, fecha, notas || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create desmedro material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/perdidas/desmedros/materiales/:id
router.delete('/desmedros/materiales/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM desmedros_material WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Desmedro no encontrado' });
    return res.json({ success: true, data: { message: 'Desmedro eliminado' } });
  } catch (err) {
    console.error('Delete desmedro material error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
