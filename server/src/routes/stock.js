const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

const router = express.Router();
router.use(auth);

/**
 * Register a stock movement and update product stock.
 * Exported for reuse in pl.js (auto-deduct on sale).
 */
async function registrarMovimiento(dbPool, { empresaId, productoId, tipo, cantidad, referenciaT, referenciaId, nota, userId }) {
  const prod = await dbPool.query('SELECT stock_actual FROM productos WHERE id = $1', [productoId]);
  const anterior = Math.round((parseFloat(prod.rows[0]?.stock_actual) || 0) * 100) / 100;
  const nuevo = Math.round((anterior + cantidad) * 100) / 100; // cantidad is negative for salidas

  await dbPool.query(
    `INSERT INTO stock_movimientos (empresa_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia_tipo, referencia_id, nota, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [empresaId, productoId, tipo, cantidad, anterior, nuevo, referenciaT, referenciaId, nota, userId]
  );

  await dbPool.query('UPDATE productos SET stock_actual = $1, updated_at = NOW() WHERE id = $2', [nuevo, productoId]);
  return { anterior, nuevo };
}

// GET /api/stock — List products with stock info (only those with control_stock enabled)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.nombre, p.imagen_url, p.stock_actual, p.stock_minimo, p.control_stock, p.sku,
              p.precio_final, p.costo_neto
       FROM productos p
       WHERE p.empresa_id = $1 AND p.control_stock = true
       ORDER BY p.stock_actual ASC`,
      [req.eid]
    );

    const productos = result.rows.map(p => ({
      ...p,
      precio_final: r2(p.precio_final),
      costo_neto: r2(p.costo_neto),
      stock_actual: r2(p.stock_actual),
      stock_minimo: r2(p.stock_minimo),
      alerta: parseFloat(p.stock_actual) <= parseFloat(p.stock_minimo),
    }));

    const total_productos = productos.length;
    const con_alerta = productos.filter(p => p.alerta).length;
    const sin_stock = productos.filter(p => parseFloat(p.stock_actual) <= 0).length;

    return res.json({
      success: true,
      data: {
        productos,
        resumen: { total_productos, con_alerta, sin_stock },
      },
    });
  } catch (err) {
    console.error('Stock list error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/stock/todos — All products with stock fields (for enabling stock)
router.get('/todos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, stock_actual, stock_minimo, control_stock, sku FROM productos WHERE empresa_id = $1 ORDER BY nombre',
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Stock todos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/stock/producto/:id — Enable/disable stock control + set minimum
router.put('/producto/:id', async (req, res) => {
  try {
    const { control_stock, stock_minimo, sku } = req.body;
    const result = await pool.query(
      'UPDATE productos SET control_stock = $1, stock_minimo = $2, sku = $3, updated_at = NOW() WHERE id = $4 AND empresa_id = $5 RETURNING id, nombre, control_stock, stock_minimo, stock_actual, sku',
      [control_stock, stock_minimo || 0, sku || null, req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Stock producto update error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/stock/ajuste — Manual stock adjustment (physical inventory count)
router.post('/ajuste', async (req, res) => {
  try {
    const { producto_id, cantidad_nueva, nota } = req.body;
    if (producto_id == null || cantidad_nueva == null) {
      return res.status(400).json({ success: false, error: 'producto_id y cantidad_nueva son requeridos' });
    }

    const prod = await pool.query('SELECT stock_actual FROM productos WHERE id = $1 AND empresa_id = $2', [producto_id, req.eid]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const anterior = parseFloat(prod.rows[0].stock_actual) || 0;
    const nueva = parseFloat(cantidad_nueva);
    const diferencia = nueva - anterior;

    const mov = await registrarMovimiento(pool, {
      empresaId: req.eid,
      productoId: producto_id,
      tipo: 'ajuste',
      cantidad: diferencia,
      referenciaT: 'ajuste_manual',
      referenciaId: null,
      nota: nota || null,
      userId: req.uid,
    });

    return res.status(201).json({ success: true, data: { producto_id, anterior: r2(mov.anterior), nuevo: r2(mov.nuevo), diferencia: r2(diferencia) } });
  } catch (err) {
    console.error('Stock ajuste error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/stock/entrada — Manual stock entry (received goods)
router.post('/entrada', async (req, res) => {
  try {
    const { producto_id, cantidad, nota } = req.body;
    if (producto_id == null || cantidad == null) {
      return res.status(400).json({ success: false, error: 'producto_id y cantidad son requeridos' });
    }

    const prod = await pool.query('SELECT id, control_stock FROM productos WHERE id = $1 AND empresa_id = $2', [producto_id, req.eid]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    // Auto-enable control_stock if not already active
    if (!prod.rows[0].control_stock) {
      await pool.query('UPDATE productos SET control_stock = true, updated_at = NOW() WHERE id = $1', [producto_id]);
    }

    const cant = parseFloat(cantidad);
    if (cant <= 0) return res.status(400).json({ success: false, error: 'cantidad debe ser mayor a 0' });

    const mov = await registrarMovimiento(pool, {
      empresaId: req.eid,
      productoId: producto_id,
      tipo: 'entrada',
      cantidad: cant,
      referenciaT: 'entrada_manual',
      referenciaId: null,
      nota: nota || null,
      userId: req.uid,
    });

    return res.status(201).json({ success: true, data: { producto_id, anterior: r2(mov.anterior), nuevo: r2(mov.nuevo), cantidad: r2(cant) } });
  } catch (err) {
    console.error('Stock entrada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/stock/movimientos?producto_id=X — Movement history
router.get('/movimientos', async (req, res) => {
  try {
    const productoId = req.query.producto_id ? parseInt(req.query.producto_id) : null;

    const result = await pool.query(
      `SELECT sm.*, p.nombre AS producto_nombre, u.nombre AS usuario_nombre
       FROM stock_movimientos sm
       JOIN productos p ON p.id = sm.producto_id
       LEFT JOIN usuarios u ON u.id = sm.created_by
       WHERE sm.empresa_id = $1
         AND ($2::int IS NULL OR sm.producto_id = $2)
       ORDER BY sm.created_at DESC LIMIT 100`,
      [req.eid, productoId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Stock movimientos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
module.exports.registrarMovimiento = registrarMovimiento;
