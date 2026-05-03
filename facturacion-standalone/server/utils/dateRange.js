const pool = require('../models/db');

/**
 * Extract date range from request query params.
 * Supports: ?year=2026&month=5 OR ?periodo_id=4 OR defaults to current month (Lima time).
 */
async function getDateRange(req) {
  const { year, month, periodo_id } = req.query;

  // Option 1: year + month (preferred, no DB lookup)
  if (year && month) {
    const y = parseInt(year);
    const m = parseInt(month);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    return { start, end };
  }

  // Option 2: periodo_id (backward compat)
  if (periodo_id) {
    const p = await pool.query('SELECT fecha_inicio, fecha_fin FROM periodos WHERE id = $1', [periodo_id]);
    if (p.rows[0]) {
      return {
        start: p.rows[0].fecha_inicio,
        end: p.rows[0].fecha_fin,
      };
    }
  }

  // Default: current month (Lima UTC-5)
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
  return { start, end };
}

module.exports = { getDateRange };
