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
      'SELECT id FROM productos WHERE id = $1 AND empresa_id = $2',
      [req.params.id, req.eid]
    );
    if (prod.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const result = await pool.query(
      `SELECT id, version, motivo, snapshot_json, costo_neto, precio_final, created_at
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
      'SELECT id FROM productos WHERE id = $1 AND empresa_id = $2',
      [req.params.id, req.eid]
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

// GET /api/historial/actividad — merged activity: CRUD logs + product versions
router.get('/actividad', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);

    // CRUD activity logs
    const logsRes = await pool.query(
      `SELECT al.id, 'log' AS tipo, al.entidad, al.entidad_id, al.accion, al.cambios_json, al.created_at,
              NULL AS producto_id, NULL AS version, NULL AS motivo, NULL AS producto_nombre, NULL AS precio_final, NULL AS costo_neto
       FROM actividad_log al
       JOIN usuarios u ON u.id = al.usuario_id
       WHERE u.empresa_id = $1
       ORDER BY al.created_at DESC LIMIT $2`,
      [req.eid, limit]
    );

    // Product version logs
    const versionsRes = await pool.query(
      `SELECT pv.id, 'version' AS tipo, 'producto' AS entidad, pv.producto_id AS entidad_id,
              CASE WHEN pv.version = 1 THEN 'crear' ELSE 'actualizar' END AS accion,
              NULL AS cambios_json, pv.created_at,
              pv.producto_id, pv.version, pv.motivo, p.nombre AS producto_nombre, pv.precio_final, pv.costo_neto
       FROM producto_versiones pv
       JOIN productos p ON p.id = pv.producto_id
       WHERE p.empresa_id = $1
       ORDER BY pv.created_at DESC LIMIT $2`,
      [req.eid, limit]
    );

    // Merge and sort by date
    const merged = [...logsRes.rows, ...versionsRes.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    return res.json({ success: true, data: merged });
  } catch (err) {
    console.error('Activity log error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/historial/audit — activity audit log
router.get('/audit', async (req, res) => {
  try {
    const { entidad, limit: lim, offset: off } = req.query;
    let query = `SELECT al.* FROM audit_log al JOIN usuarios u ON u.id = al.usuario_id WHERE u.empresa_id = $1`;
    const params = [req.eid];
    let idx = 2;

    if (entidad) {
      query += ` AND entidad = $${idx++}`;
      params.push(entidad);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${idx++}`;
    params.push(parseInt(lim) || 50);
    if (off) {
      query += ` OFFSET $${idx++}`;
      params.push(parseInt(off));
    }

    const result = await pool.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Audit log error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
