const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { getDateRange } = require('../utils/dateRange');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

const router = express.Router();
router.use(auth);

// GET /api/comisiones?year=X&month=Y — Commission summary by vendor
router.get('/', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT c.vendedor_id, u.nombre AS vendedor_nombre, u.comision_pct,
        COUNT(*) AS num_ventas,
        SUM(c.base_comision) AS total_base,
        SUM(c.comision_monto) AS total_comision
       FROM comisiones c
       JOIN usuarios u ON u.id = c.vendedor_id
       WHERE c.empresa_id = $1 AND c.fecha >= $2 AND c.fecha <= $3
       GROUP BY c.vendedor_id, u.nombre, u.comision_pct
       ORDER BY total_comision DESC`,
      [req.eid, start, end]
    );

    const data = result.rows.map(r => ({
      ...r,
      total_base: r2(r.total_base),
      total_comision: r2(r.total_comision),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Comisiones summary error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/comisiones/vendedor/:id?year=X&month=Y — Detail for one vendor
router.get('/vendedor/:id', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT c.*, v.total AS venta_total
       FROM comisiones c
       LEFT JOIN ventas v ON v.id = c.venta_id
       WHERE c.empresa_id = $1 AND c.vendedor_id = $2 AND c.fecha >= $3 AND c.fecha <= $4
       ORDER BY c.fecha DESC`,
      [req.eid, req.params.id, start, end]
    );

    const data = result.rows.map(r => ({
      ...r,
      base_comision: r2(r.base_comision),
      comision_monto: r2(r.comision_monto),
      venta_total: r2(r.venta_total),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Comisiones vendedor detail error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
