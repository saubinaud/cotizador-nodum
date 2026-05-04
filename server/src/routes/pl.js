const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { aBase, getUnidadBase } = require('../utils/unidades');
const { logAudit } = require('../utils/audit');
const { getDateRange } = require('../utils/dateRange');

/**
 * Recalculates WAC (Weighted Average Cost) for an insumo
 * based on all purchase history in insumo_precios.
 * Updates insumos.costo_base with the new WAC.
 */
async function recalcularWAC(insumoId) {
  const hist = await pool.query(
    'SELECT cantidad_base, precio_total FROM insumo_precios WHERE insumo_id = $1',
    [insumoId]
  );
  if (hist.rows.length === 0) return;

  const totalCantidad = hist.rows.reduce((s, r) => s + parseFloat(r.cantidad_base), 0);
  const totalPrecio = hist.rows.reduce((s, r) => s + parseFloat(r.precio_total), 0);

  if (totalCantidad <= 0) return;

  const wac = totalPrecio / totalCantidad;
  await pool.query(
    'UPDATE insumos SET costo_base = $1, updated_at = NOW() WHERE id = $2',
    [wac, insumoId]
  );
  return wac;
}

/**
 * Auto-find periodo_id for a given fecha (for backward-compat writes).
 */
async function findPeriodoId(empresaId, fecha) {
  let periodoId = null;
  try {
    const pRes = await pool.query(
      'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
      [empresaId, fecha]
    );
    periodoId = pRes.rows[0]?.id || null;
  } catch (_) {}
  return periodoId;
}

const router = express.Router();
router.use(auth);

// GET /api/pl/insumo-precios/:insumoId — price history + WAC
router.get('/insumo-precios/:insumoId', async (req, res) => {
  try {
    const history = await pool.query(
      'SELECT * FROM insumo_precios WHERE insumo_id = $1 ORDER BY fecha DESC LIMIT 20',
      [req.params.insumoId]
    );
    const insumo = await pool.query(
      'SELECT id, nombre, costo_base, unidad_base, unidad_medida, precio_presentacion, cantidad_presentacion FROM insumos WHERE id = $1',
      [req.params.insumoId]
    );

    const hist = history.rows;
    const totalCantBase = hist.reduce((s, r) => s + parseFloat(r.cantidad_base), 0);
    const totalPrecio = hist.reduce((s, r) => s + parseFloat(r.precio_total), 0);
    const wac = totalCantBase > 0 ? totalPrecio / totalCantBase : 0;
    const ultimoPrecio = hist.length > 0 ? parseFloat(hist[0].costo_por_base) : 0;
    const precioMinimo = hist.length > 0 ? Math.min(...hist.map(h => parseFloat(h.costo_por_base))) : 0;
    const precioMaximo = hist.length > 0 ? Math.max(...hist.map(h => parseFloat(h.costo_por_base))) : 0;

    return res.json({ success: true, data: {
      insumo: insumo.rows[0],
      historial: hist,
      wac,
      ultimo_precio: ultimoPrecio,
      precio_minimo: precioMinimo,
      precio_maximo: precioMaximo,
      num_compras: hist.length,
    }});
  } catch (err) {
    console.error('Insumo precios error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== TRANSACCIONES ====================

// GET /api/pl/transacciones/balance?year=2026&month=5 — quick balance
router.get('/transacciones/balance', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);
    const result = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN t.tipo = 'venta' THEN t.monto_absoluto ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN t.tipo = 'compra' THEN t.monto_absoluto ELSE 0 END), 0) AS compras,
        COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto_absoluto ELSE 0 END), 0) AS gastos,
        COALESCE(SUM(t.monto), 0) AS balance,
        COUNT(*) AS total_transacciones
       FROM transacciones t
       WHERE t.empresa_id = $1 AND t.fecha >= $2 AND t.fecha <= $3`,
      [req.eid, start, end]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Balance error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/transacciones?year=2026&month=5&tipo=venta — timeline
router.get('/transacciones', async (req, res) => {
  try {
    const { tipo, limit: lim } = req.query;
    const { start, end } = await getDateRange(req);
    let query = `SELECT t.*,
      p.nombre AS producto_nombre, p.imagen_url AS producto_imagen, p.costo_neto AS producto_costo_neto,
      cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo
     FROM transacciones t
     LEFT JOIN productos p ON p.id = t.producto_id
     LEFT JOIN categorias_gasto cg ON cg.id = t.categoria_id
     WHERE t.empresa_id = $1 AND t.fecha >= $2 AND t.fecha <= $3`;
    const params = [req.eid, start, end];
    let paramIdx = 4;

    if (tipo) {
      query += ` AND t.tipo = $${paramIdx++}`;
      params.push(tipo);
    }
    query += ' ORDER BY t.fecha DESC, t.created_at DESC';
    if (lim) {
      query += ` LIMIT $${paramIdx++}`;
      params.push(parseInt(lim));
    }

    const result = await pool.query(query, params);

    // For compras, get items
    for (const t of result.rows) {
      if (t.tipo === 'compra' && t.compra_id) {
        const items = await pool.query(
          `SELECT ci.*, COALESCE(i.nombre, m.nombre, ci.nombre_item) AS item_nombre
           FROM compra_items ci LEFT JOIN insumos i ON i.id = ci.insumo_id LEFT JOIN materiales m ON m.id = ci.material_id
           WHERE ci.compra_id = $1`, [t.compra_id]
        );
        t.compra_items = items.rows;
      }
    }

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Transacciones error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/transacciones — quick create any transaction
router.post('/transacciones', async (req, res) => {
  try {
    const { tipo, fecha, producto_id, cantidad, precio_unitario,
            descuento_tipo, descuento_valor, categoria_id, monto_absoluto,
            descripcion, nota } = req.body;

    if (!tipo || !fecha) return res.status(400).json({ success: false, error: 'tipo y fecha requeridos' });

    // Auto-find periodo for backward compat
    const pid = await findPeriodoId(req.eid, fecha);

    let monto = 0;
    let montoAbs = 0;

    if (tipo === 'venta') {
      const prod = await pool.query('SELECT precio_final, costo_neto FROM productos WHERE id = $1', [producto_id]);
      const precio = precio_unitario || parseFloat(prod.rows[0]?.precio_final || 0);
      const cant = parseInt(cantidad) || 1;
      let desc = 0;
      const descVal = parseFloat(descuento_valor) || 0;
      if (descuento_tipo === 'total') desc = descVal;
      else if (descuento_tipo === 'unit') desc = descVal * cant;
      else if (descuento_tipo === 'percent') desc = (precio * cant) * (descVal / 100);

      montoAbs = (precio * cant) - desc;
      monto = montoAbs; // positive = income
    } else if (tipo === 'gasto' || tipo === 'compra') {
      montoAbs = parseFloat(monto_absoluto) || 0;
      monto = -montoAbs; // negative = expense
    }

    const result = await pool.query(
      `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, producto_id, cantidad, precio_unitario,
        descuento, descuento_tipo, descuento_valor, categoria_id, monto, monto_absoluto, descripcion, nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [req.uid, req.eid, pid, tipo, fecha, producto_id || null, cantidad || null, precio_unitario || null,
        tipo === 'venta' ? (montoAbs - (parseFloat(precio_unitario || 0) * parseInt(cantidad || 1))) * -1 : 0,
        descuento_tipo || 'none', descuento_valor || 0, categoria_id || null,
        monto, montoAbs, descripcion || null, nota || null]
    );

    // Also insert into legacy tables for backward compatibility
    if (tipo === 'venta' && pid) {
      await pool.query(
        'INSERT INTO ventas (empresa_id, periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [req.eid, pid, producto_id, fecha, cantidad || 1, precio_unitario || 0, 0, montoAbs]
      ).catch(() => {});
    }
    if (tipo === 'gasto' && pid && categoria_id) {
      await pool.query(
        'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1,$2,$3,$4,$5)',
        [pid, categoria_id, fecha, montoAbs, descripcion]
      ).catch(() => {});
    }

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create transaccion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/pl/transacciones/:id
router.delete('/transacciones/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM transacciones WHERE id = $1 AND empresa_id = $2 RETURNING id', [req.params.id, req.eid]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Transaccion no encontrada' });
    return res.json({ success: true, data: { message: 'Eliminada' } });
  } catch (err) {
    console.error('Delete transaccion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== P&L RESUMEN ====================

// GET /api/pl/resumen?year=2026&month=5 — full P&L calculation
router.get('/resumen', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    // Revenue
    const ventasRes = await pool.query(
      `SELECT
        COALESCE(SUM(v.total), 0) AS ingresos_brutos,
        COALESCE(SUM(v.descuento), 0) AS descuentos,
        COALESCE(SUM(v.cantidad), 0) AS unidades_vendidas,
        COUNT(*) AS num_ventas
       FROM ventas v
       WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3`,
      [req.eid, start, end]
    );

    // COGS from sales x product costs (multi-product via venta_items + legacy fallback)
    const cogsRes = await pool.query(
      `SELECT
        COALESCE(SUM(cogs_insumos), 0) AS cogs_insumos,
        COALESCE(SUM(cogs_empaque), 0) AS cogs_empaque
       FROM (
        -- Multi-product ventas (with venta_items)
        SELECT
          vi.cantidad * COALESCE(p.costo_insumos, 0) AS cogs_insumos,
          vi.cantidad * COALESCE(p.costo_empaque, 0) AS cogs_empaque
        FROM venta_items vi
        JOIN productos p ON p.id = vi.producto_id
        JOIN ventas v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
        UNION ALL
        -- Legacy ventas (no venta_items, producto_id directly on venta)
        SELECT
          v.cantidad * COALESCE(p.costo_insumos, 0) AS cogs_insumos,
          v.cantidad * COALESCE(p.costo_empaque, 0) AS cogs_empaque
        FROM ventas v
        JOIN productos p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
          AND NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.venta_id = v.id)
       ) sub`,
      [req.eid, start, end]
    );

    // Expenses
    const gastosRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN cg.tipo = 'fijo' THEN g.monto ELSE 0 END), 0) AS gastos_fijos,
        COALESCE(SUM(CASE WHEN cg.tipo = 'variable' THEN g.monto ELSE 0 END), 0) AS gastos_variables
       FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE cg.empresa_id = $1 AND g.fecha >= $2 AND g.fecha <= $3`,
      [req.eid, start, end]
    );

    // Real COGS from purchases
    const comprasRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS compras_insumos,
        COALESCE(SUM(CASE WHEN ci.material_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS compras_materiales,
        COALESCE(SUM(ci.total), 0) AS compras_total
       FROM compras c
       LEFT JOIN compra_items ci ON ci.compra_id = c.id
       WHERE c.empresa_id = $1 AND c.fecha >= $2 AND c.fecha <= $3`,
      [req.eid, start, end]
    );
    const comp = comprasRes.rows[0];

    // Top products (combine venta_items + legacy ventas)
    const topProductos = await pool.query(
      `SELECT p.id, p.nombre, p.imagen_url,
              SUM(sub.cantidad) AS unidades, SUM(sub.ingresos) AS ingresos,
              SUM(sub.cantidad * p.costo_neto) AS costo_total,
              SUM(sub.ingresos) - SUM(sub.cantidad * p.costo_neto) AS utilidad
       FROM (
        -- From venta_items
        SELECT vi.producto_id, vi.cantidad, vi.subtotal AS ingresos
        FROM venta_items vi
        JOIN ventas v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
        UNION ALL
        -- Legacy ventas without venta_items
        SELECT v.producto_id, v.cantidad, v.total AS ingresos
        FROM ventas v
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
          AND v.producto_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.venta_id = v.id)
       ) sub
       JOIN productos p ON p.id = sub.producto_id
       GROUP BY p.id, p.nombre, p.imagen_url
       ORDER BY ingresos DESC LIMIT 10`,
      [req.eid, start, end]
    );

    // Desmedros (operational waste losses)
    const desmedrosRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN t.tipo = 'producto' THEN t.total ELSE 0 END), 0) AS productos,
        COALESCE(SUM(CASE WHEN t.tipo = 'preparacion' THEN t.total ELSE 0 END), 0) AS preparaciones,
        COALESCE(SUM(CASE WHEN t.tipo = 'insumo' THEN t.total ELSE 0 END), 0) AS insumos,
        COALESCE(SUM(CASE WHEN t.tipo = 'material' THEN t.total ELSE 0 END), 0) AS materiales,
        COALESCE(SUM(t.total), 0) AS total
       FROM (
        SELECT 'producto' AS tipo, perdida_total AS total FROM desmedros_producto WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3
        UNION ALL
        SELECT 'preparacion', perdida_total FROM desmedros_preparacion WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3
        UNION ALL
        SELECT 'insumo', perdida_total FROM desmedros_insumo WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3
        UNION ALL
        SELECT 'material', perdida_total FROM desmedros_material WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3
       ) t`,
      [req.eid, start, end]
    );
    const desmedros = desmedrosRes.rows[0];
    const desmedros_total = parseFloat(desmedros.total);

    const v = ventasRes.rows[0];
    const c = cogsRes.rows[0];
    const g = gastosRes.rows[0];

    const ingresos_brutos = parseFloat(v.ingresos_brutos);
    const descuentos_val = parseFloat(v.descuentos);
    const ingresos_netos = ingresos_brutos - descuentos_val;
    const cogs_insumos = parseFloat(c.cogs_insumos);
    const cogs_empaque = parseFloat(c.cogs_empaque);
    const cogs_total = cogs_insumos + cogs_empaque;
    const utilidad_bruta = ingresos_netos - cogs_total;
    const gastos_fijos = parseFloat(g.gastos_fijos);
    const gastos_variables = parseFloat(g.gastos_variables);
    const gastos_total = gastos_fijos + gastos_variables;
    const utilidad_operativa = utilidad_bruta - gastos_total - desmedros_total;

    // IGV calculation
    const user = await pool.query('SELECT igv_rate, tipo_negocio FROM empresas WHERE id = $1', [req.eid]);
    const igvRate = user.rows[0]?.tipo_negocio === 'informal' ? 0 : parseFloat(user.rows[0]?.igv_rate || 0);
    const impuestos = utilidad_operativa > 0 ? utilidad_operativa * igvRate : 0;
    const utilidad_neta = utilidad_operativa - impuestos;

    const food_cost_pct = ingresos_netos > 0 ? (cogs_insumos / ingresos_netos) * 100 : 0;
    const margen_bruto_pct = ingresos_netos > 0 ? (utilidad_bruta / ingresos_netos) * 100 : 0;
    const margen_neto_pct = ingresos_netos > 0 ? (utilidad_neta / ingresos_netos) * 100 : 0;
    const ticket_promedio = parseInt(v.num_ventas) > 0 ? ingresos_brutos / parseInt(v.num_ventas) : 0;
    const punto_equilibrio = margen_bruto_pct > 0 ? gastos_fijos / (margen_bruto_pct / 100) : 0;

    return res.json({
      success: true,
      data: {
        rango: { start, end },
        ingresos: { brutos: ingresos_brutos, descuentos: descuentos_val, netos: ingresos_netos },
        cogs: { insumos: cogs_insumos, empaque: cogs_empaque, total: cogs_total },
        utilidad_bruta,
        gastos: { fijos: gastos_fijos, variables: gastos_variables, total: gastos_total },
        desmedros: {
          productos: parseFloat(desmedros.productos),
          preparaciones: parseFloat(desmedros.preparaciones),
          insumos: parseFloat(desmedros.insumos),
          materiales: parseFloat(desmedros.materiales),
          total: desmedros_total,
        },
        utilidad_operativa,
        impuestos,
        utilidad_neta,
        kpis: {
          food_cost_pct: Math.round(food_cost_pct * 10) / 10,
          margen_bruto_pct: Math.round(margen_bruto_pct * 10) / 10,
          margen_neto_pct: Math.round(margen_neto_pct * 10) / 10,
          ticket_promedio: Math.round(ticket_promedio * 100) / 100,
          punto_equilibrio: Math.round(punto_equilibrio * 100) / 100,
          unidades_vendidas: parseInt(v.unidades_vendidas),
          num_ventas: parseInt(v.num_ventas),
        },
        cogs_real: {
          insumos: parseFloat(comp.compras_insumos),
          materiales: parseFloat(comp.compras_materiales),
          total: parseFloat(comp.compras_total),
        },
        top_productos: topProductos.rows,
      },
    });
  } catch (err) {
    console.error('PL resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== PERIODOS ====================

// GET /api/pl/periodos
router.get('/periodos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM periodos WHERE empresa_id = $1 ORDER BY fecha_inicio DESC',
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List periodos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/periodos
router.post('/periodos', async (req, res) => {
  try {
    const { nombre, tipo, fecha_inicio, fecha_fin } = req.body;
    if (!nombre || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ success: false, error: 'Nombre y fechas son requeridos' });
    }
    // Check for duplicate periodo (same empresa + overlapping dates)
    const dup = await pool.query(
      'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio = $2',
      [req.eid, fecha_inicio]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya existe un periodo para ese rango de fechas.' });
    }

    const result = await pool.query(
      'INSERT INTO periodos (usuario_id, empresa_id, nombre, tipo, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.uid, req.eid, nombre, tipo || 'mensual', fecha_inicio, fecha_fin]
    );

    // Seed default expense categories if first period
    const catCount = await pool.query('SELECT COUNT(*) FROM categorias_gasto WHERE empresa_id = $1', [req.eid]);
    if (parseInt(catCount.rows[0].count) === 0) {
      const defaultCats = [
        { nombre: 'Alquiler', tipo: 'fijo', recurrente: true, orden: 1 },
        { nombre: 'Planilla / Sueldos', tipo: 'fijo', recurrente: true, orden: 2 },
        { nombre: 'Servicios (luz, agua, gas)', tipo: 'fijo', recurrente: true, orden: 3 },
        { nombre: 'Marketing / Publicidad', tipo: 'variable', recurrente: false, orden: 4 },
        { nombre: 'Delivery / Transporte', tipo: 'variable', recurrente: false, orden: 5 },
        { nombre: 'Mantenimiento', tipo: 'variable', recurrente: false, orden: 6 },
        { nombre: 'Software / Suscripciones', tipo: 'fijo', recurrente: true, orden: 7 },
        { nombre: 'Seguros', tipo: 'fijo', recurrente: true, orden: 8 },
        { nombre: 'Otros gastos', tipo: 'variable', recurrente: false, orden: 9 },
      ];
      for (const cat of defaultCats) {
        await pool.query(
          'INSERT INTO categorias_gasto (usuario_id, empresa_id, nombre, tipo, recurrente, orden) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.uid, req.eid, cat.nombre, cat.tipo, cat.recurrente, cat.orden]
        );
      }
    }

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create periodo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/periodos/:id
router.put('/periodos/:id', async (req, res) => {
  try {
    const { nombre, estado } = req.body;
    const result = await pool.query(
      'UPDATE periodos SET nombre = COALESCE($1, nombre), estado = COALESCE($2, estado) WHERE id = $3 AND empresa_id = $4 RETURNING *',
      [nombre, estado, req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update periodo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/pl/periodos/:id
router.delete('/periodos/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM periodos WHERE id = $1 AND empresa_id = $2 RETURNING id', [req.params.id, req.eid]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    return res.json({ success: true, data: { message: 'Periodo eliminado' } });
  } catch (err) {
    console.error('Delete periodo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/periodos/:id/saldo-inicial — update opening balance
router.put('/periodos/:id/saldo-inicial', async (req, res) => {
  try {
    const { saldo_inicial } = req.body;
    if (saldo_inicial == null) return res.status(400).json({ success: false, error: 'saldo_inicial requerido' });

    const result = await pool.query(
      'UPDATE periodos SET saldo_inicial = $1, updated_at = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING id, saldo_inicial',
      [parseFloat(saldo_inicial), req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update saldo inicial error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== CATEGORIAS GASTO ====================

// GET /api/pl/categorias
router.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias_gasto WHERE empresa_id = $1 AND activa = true ORDER BY orden, nombre',
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List categorias error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/categorias
router.post('/categorias', async (req, res) => {
  try {
    const { nombre, tipo, recurrente, monto_default } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const result = await pool.query(
      'INSERT INTO categorias_gasto (usuario_id, empresa_id, nombre, tipo, recurrente, monto_default) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.uid, req.eid, nombre, tipo || 'variable', recurrente || false, monto_default || null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create categoria error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/categorias/:id
router.put('/categorias/:id', async (req, res) => {
  try {
    const { nombre, tipo, recurrente, monto_default, activa } = req.body;
    const result = await pool.query(
      `UPDATE categorias_gasto SET
        nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo),
        recurrente = COALESCE($3, recurrente), monto_default = $4, activa = COALESCE($5, activa)
       WHERE id = $6 AND empresa_id = $7 RETURNING *`,
      [nombre, tipo, recurrente, monto_default, activa, req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Categoria no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update categoria error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== VENTAS ====================

// GET /api/pl/ventas?year=2026&month=5
router.get('/ventas', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT v.*, p.nombre AS producto_nombre, p.costo_neto AS producto_costo_neto,
              p.costo_insumos AS producto_costo_insumos, p.costo_empaque AS producto_costo_empaque,
              p.imagen_url AS producto_imagen
       FROM ventas v
       LEFT JOIN productos p ON p.id = v.producto_id
       WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
       ORDER BY v.fecha DESC, v.created_at DESC`,
      [req.eid, start, end]
    );

    // Load venta_items for each venta
    for (const venta of result.rows) {
      const itemsRes = await pool.query(
        `SELECT vi.*, p.nombre AS producto_nombre
         FROM venta_items vi
         JOIN productos p ON p.id = vi.producto_id
         WHERE vi.venta_id = $1
         ORDER BY vi.id`,
        [venta.id]
      );
      if (itemsRes.rows.length > 0) {
        venta.items = itemsRes.rows;
      } else if (venta.producto_id) {
        // Legacy venta without venta_items — create virtual items array
        venta.items = [{
          id: null,
          venta_id: venta.id,
          producto_id: venta.producto_id,
          cantidad: venta.cantidad,
          precio_unitario: venta.precio_unitario,
          descuento: parseFloat(venta.descuento) || 0,
          subtotal: parseFloat(venta.total) - (parseFloat(venta.costo_envio) || 0),
          producto_nombre: venta.producto_nombre,
        }];
      } else {
        venta.items = [];
      }
    }

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List ventas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/ventas
router.post('/ventas', async (req, res) => {
  const client = await pool.connect();
  try {
    let { items, producto_id, fecha, cantidad, precio_unitario, descuento, descuento_global, nota, cuenta_id,
            tipo_envio, costo_envio, zona_envio_id, direccion_envio, canal_id, cliente_id } = req.body;

    // Backward compat: old single-product format -> convert to items array
    if (!items && producto_id) {
      if (!fecha || !cantidad) {
        return res.status(400).json({ success: false, error: 'producto_id, fecha y cantidad son requeridos' });
      }
      // Get product price if not provided
      const prod = await pool.query('SELECT precio_final, costo_neto FROM productos WHERE id = $1 AND empresa_id = $2', [producto_id, req.eid]);
      if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
      const precio = precio_unitario || parseFloat(prod.rows[0].precio_final);
      items = [{ producto_id, cantidad: parseInt(cantidad), precio_unitario: precio, descuento: parseFloat(descuento) || 0 }];
      descuento_global = 0;
    }

    if (!fecha) {
      return res.status(400).json({ success: false, error: 'fecha es requerido' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items debe ser un array con al menos 1 item' });
    }

    // Calculate per-item subtotals
    let totalDescuentoItems = 0;
    let totalCantidad = 0;
    for (const item of items) {
      const itemDesc = parseFloat(item.descuento) || 0;
      item._subtotal = (parseFloat(item.precio_unitario) * parseInt(item.cantidad)) - itemDesc;
      totalDescuentoItems += itemDesc;
      totalCantidad += parseInt(item.cantidad);
    }

    const descGlobal = parseFloat(descuento_global) || 0;
    const costoEnvio = parseFloat(costo_envio) || 0;
    const sumSubtotals = items.reduce((s, i) => s + i._subtotal, 0);
    const total = sumSubtotals - descGlobal + costoEnvio;

    // producto_id on the venta: if single item, use it; otherwise NULL
    const ventaProductoId = items.length === 1 ? items[0].producto_id : null;
    // precio_unitario on the venta: if single item, use it; otherwise NULL
    const ventaPrecioUnitario = items.length === 1 ? parseFloat(items[0].precio_unitario) : null;

    // Auto-find periodo for backward compat
    const pid = await findPeriodoId(req.eid, fecha);

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO ventas (empresa_id, periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, descuento_global, total, nota,
        tipo_envio, costo_envio, zona_envio_id, direccion_envio, canal_id, cliente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [req.eid, pid, ventaProductoId, fecha, totalCantidad, ventaPrecioUnitario, totalDescuentoItems, descGlobal, total, nota || null,
        tipo_envio || null, costoEnvio, zona_envio_id || null, direccion_envio || null, canal_id || null, cliente_id || null]
    );
    const venta = result.rows[0];

    // Insert venta_items
    for (const item of items) {
      await client.query(
        `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [venta.id, item.producto_id, parseInt(item.cantidad), parseFloat(item.precio_unitario), parseFloat(item.descuento) || 0, item._subtotal]
      );
    }

    await client.query('COMMIT');

    // Dual-write ONE transaccion for the whole ticket (with cuenta_id for cash flow)
    try {
      await pool.query(
        `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, producto_id, cantidad, precio_unitario, descuento, monto, monto_absoluto, descripcion, cuenta_id)
         VALUES ($1, $2, $3, 'venta', $4, $5, $6, $7, $8, $9, $9, $10, $11)`,
        [req.uid, req.eid, pid, fecha, ventaProductoId, totalCantidad, ventaPrecioUnitario, totalDescuentoItems + descGlobal, total, nota || null, cuenta_id || null]
      );
      // Update account balance if specified
      if (cuenta_id) {
        await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2', [total, cuenta_id]);
      }
    } catch (_) {}

    logAudit({ userId: req.user.id, entidad: 'venta', entidadId: venta.id, accion: 'crear', descripcion: `Registro venta de ${totalCantidad} unidad(es)` });

    return res.status(201).json({ success: true, data: venta });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create venta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// GET /api/pl/ventas/resumen?year=2026&month=5 — summary totals (MUST be before /:id)
router.get('/ventas/resumen', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    // Venta-level summary
    const ventaSummary = await pool.query(
      `SELECT
        COUNT(*) AS total_ventas,
        COALESCE(SUM(v.total), 0) AS ingresos_brutos,
        COALESCE(SUM(COALESCE(v.descuento, 0) + COALESCE(v.descuento_global, 0)), 0) AS descuentos,
        COALESCE(SUM(v.cantidad), 0) AS unidades_vendidas
       FROM ventas v
       WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3`,
      [req.eid, start, end]
    );

    // COGS: combine venta_items + legacy
    const cogsSummary = await pool.query(
      `SELECT
        COALESCE(SUM(sub.cogs_neto), 0) AS cogs_total,
        COALESCE(SUM(sub.cogs_insumos), 0) AS cogs_insumos,
        COALESCE(SUM(sub.cogs_empaque), 0) AS cogs_empaque
       FROM (
        SELECT vi.cantidad * COALESCE(p.costo_neto, 0) AS cogs_neto,
               vi.cantidad * COALESCE(p.costo_insumos, 0) AS cogs_insumos,
               vi.cantidad * COALESCE(p.costo_empaque, 0) AS cogs_empaque
        FROM venta_items vi
        JOIN productos p ON p.id = vi.producto_id
        JOIN ventas v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
        UNION ALL
        SELECT v.cantidad * COALESCE(p.costo_neto, 0),
               v.cantidad * COALESCE(p.costo_insumos, 0),
               v.cantidad * COALESCE(p.costo_empaque, 0)
        FROM ventas v
        JOIN productos p ON p.id = v.producto_id
        WHERE v.empresa_id = $1 AND v.fecha >= $2 AND v.fecha <= $3
          AND NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.venta_id = v.id)
       ) sub`,
      [req.eid, start, end]
    );

    const vs = ventaSummary.rows[0];
    const cs = cogsSummary.rows[0];
    const data = {
      total_ventas: vs.total_ventas,
      ingresos_brutos: vs.ingresos_brutos,
      descuentos: vs.descuentos,
      ingresos_netos: parseFloat(vs.ingresos_brutos) - parseFloat(vs.descuentos),
      cogs_total: cs.cogs_total,
      cogs_insumos: cs.cogs_insumos,
      cogs_empaque: cs.cogs_empaque,
      unidades_vendidas: vs.unidades_vendidas,
    };
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Ventas resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/ventas/:id
router.put('/ventas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, cantidad, precio_unitario, descuento, descuento_global, nota, fecha, cliente_id, canal_id, cuenta_id,
            tipo_envio, costo_envio, zona_envio_id, direccion_envio } = req.body;

    const existing = await pool.query('SELECT * FROM ventas WHERE id = $1 AND empresa_id = $2', [req.params.id, req.eid]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    const prev = existing.rows[0];

    const envio = costo_envio != null ? parseFloat(costo_envio) : parseFloat(prev.costo_envio || 0);

    await client.query('BEGIN');

    let cant, precio, desc, descGlobal, total, ventaProductoId;

    if (items && Array.isArray(items) && items.length > 0) {
      // Multi-product update: replace all items
      await client.query('DELETE FROM venta_items WHERE venta_id = $1', [req.params.id]);

      let totalDescuentoItems = 0;
      let totalCantidad = 0;
      let sumSubtotals = 0;

      for (const item of items) {
        const itemDesc = parseFloat(item.descuento) || 0;
        const subtotal = (parseFloat(item.precio_unitario) * parseInt(item.cantidad)) - itemDesc;
        totalDescuentoItems += itemDesc;
        totalCantidad += parseInt(item.cantidad);
        sumSubtotals += subtotal;

        await client.query(
          `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.params.id, item.producto_id, parseInt(item.cantidad), parseFloat(item.precio_unitario), itemDesc, subtotal]
        );
      }

      descGlobal = descuento_global != null ? parseFloat(descuento_global) : parseFloat(prev.descuento_global || 0);
      total = sumSubtotals - descGlobal + envio;
      cant = totalCantidad;
      precio = items.length === 1 ? parseFloat(items[0].precio_unitario) : null;
      desc = totalDescuentoItems;
      ventaProductoId = items.length === 1 ? items[0].producto_id : null;
    } else {
      // Legacy single-product update (no items array provided)
      precio = precio_unitario != null ? parseFloat(precio_unitario) : parseFloat(prev.precio_unitario);
      cant = cantidad != null ? parseInt(cantidad) : parseInt(prev.cantidad);
      desc = descuento != null ? parseFloat(descuento) : parseFloat(prev.descuento || 0);
      descGlobal = descuento_global != null ? parseFloat(descuento_global) : parseFloat(prev.descuento_global || 0);
      total = (precio * cant) - desc - descGlobal + envio;
      ventaProductoId = prev.producto_id;
    }

    const result = await client.query(
      `UPDATE ventas SET
        producto_id = $1,
        cantidad = $2, precio_unitario = $3, descuento = $4, descuento_global = $5, total = $6,
        nota = COALESCE($7, nota),
        fecha = COALESCE($8, fecha),
        cliente_id = $9,
        canal_id = $10,
        tipo_envio = $11,
        costo_envio = $12,
        zona_envio_id = $13,
        direccion_envio = $14,
        updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [ventaProductoId,
       cant, precio, desc, descGlobal, total,
       nota !== undefined ? (nota || null) : null,
       fecha || null,
       cliente_id !== undefined ? (cliente_id || null) : prev.cliente_id,
       canal_id !== undefined ? (canal_id || null) : prev.canal_id,
       tipo_envio !== undefined ? (tipo_envio || null) : prev.tipo_envio,
       envio,
       zona_envio_id !== undefined ? (zona_envio_id || null) : prev.zona_envio_id,
       direccion_envio !== undefined ? (direccion_envio || null) : prev.direccion_envio,
       req.params.id]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update venta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// DELETE /api/pl/ventas/:id
router.delete('/ventas/:id', async (req, res) => {
  try {
    // Get venta info before deleting to clean up transacciones
    const venta = await pool.query('SELECT * FROM ventas WHERE id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM ventas WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });

    // Best-effort cleanup of matching transaccion
    if (venta.rows[0]) {
      const v = venta.rows[0];
      try {
        await pool.query(
          `DELETE FROM transacciones WHERE ctid = (SELECT ctid FROM transacciones WHERE tipo = 'venta' AND producto_id = $1 AND fecha = $2 AND monto_absoluto = $3 AND empresa_id = $4 LIMIT 1)`,
          [v.producto_id, v.fecha, v.total, v.empresa_id]
        );
      } catch (_) {}
    }

    logAudit({ userId: req.user.id, entidad: 'venta', entidadId: req.params.id, accion: 'eliminar', descripcion: 'Elimino venta' });

    return res.json({ success: true, data: { message: 'Venta eliminada' } });
  } catch (err) {
    console.error('Delete venta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== GASTOS ====================

// GET /api/pl/gastos/resumen?year=2026&month=5 — summary by category
// PUT THIS BEFORE /:id ROUTES
router.get('/gastos/resumen', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT
        cg.id AS categoria_id, cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo,
        COALESCE(SUM(g.monto), 0) AS total
       FROM categorias_gasto cg
       LEFT JOIN gastos g ON g.categoria_id = cg.id AND g.fecha >= $1 AND g.fecha <= $2
       WHERE cg.empresa_id = $3 AND cg.activa = true
       GROUP BY cg.id, cg.nombre, cg.tipo
       ORDER BY cg.orden, cg.nombre`,
      [start, end, req.eid]
    );

    const fijos = result.rows.filter(r => r.categoria_tipo === 'fijo').reduce((s, r) => s + parseFloat(r.total), 0);
    const variables = result.rows.filter(r => r.categoria_tipo === 'variable').reduce((s, r) => s + parseFloat(r.total), 0);

    return res.json({ success: true, data: {
      categorias: result.rows,
      total_fijos: fijos,
      total_variables: variables,
      total: fijos + variables,
    }});
  } catch (err) {
    console.error('Gastos resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/gastos?year=2026&month=5
router.get('/gastos', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT g.*, cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo
       FROM gastos g
       JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE cg.empresa_id = $1 AND g.fecha >= $2 AND g.fecha <= $3
       ORDER BY g.fecha DESC, g.created_at DESC`,
      [req.eid, start, end]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List gastos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/gastos/copiar-recurrentes — copy recurring expenses from previous month
router.post('/gastos/copiar-recurrentes', async (req, res) => {
  try {
    const { fecha } = req.body;
    // Determine target date range: use provided fecha or current month
    let targetStart, targetEnd;
    if (fecha) {
      const d = new Date(fecha);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      targetStart = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      targetEnd = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    } else {
      // Also accept year/month query params or periodo_id via getDateRange
      const range = await getDateRange(req);
      targetStart = range.start;
      targetEnd = range.end;
    }

    // Compute previous month range
    const targetDate = new Date(targetStart);
    const prevMonth = targetDate.getMonth(); // 0-indexed, so this is already prev month
    const prevYear = prevMonth === 0 ? targetDate.getFullYear() - 1 : targetDate.getFullYear();
    const prevM = prevMonth === 0 ? 12 : prevMonth;
    const prevStart = `${prevYear}-${String(prevM).padStart(2, '0')}-01`;
    const prevLastDay = new Date(prevYear, prevM, 0).getDate();
    const prevEnd = `${prevYear}-${String(prevM).padStart(2, '0')}-${prevLastDay}`;

    // Auto-find periodo for backward compat writes
    const pid = await findPeriodoId(req.eid, targetStart);

    // Try to find recurring expenses from previous month
    const prevGastos = await pool.query(
      `SELECT g.categoria_id, g.monto, g.descripcion
       FROM gastos g
       JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE cg.empresa_id = $1 AND cg.recurrente = true AND g.fecha >= $2 AND g.fecha <= $3`,
      [req.eid, prevStart, prevEnd]
    );

    if (prevGastos.rows.length === 0) {
      // No previous month data — use category defaults
      const cats = await pool.query(
        'SELECT id, monto_default FROM categorias_gasto WHERE empresa_id = $1 AND recurrente = true AND monto_default IS NOT NULL AND monto_default > 0',
        [req.eid]
      );
      let count = 0;
      for (const cat of cats.rows) {
        await pool.query(
          'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5)',
          [pid, cat.id, targetStart, cat.monto_default, 'Gasto recurrente (default)']
        );
        count++;
      }
      return res.json({ success: true, data: { copied: count, source: 'defaults' } });
    }

    // Copy from previous month — only recurring categories
    let count = 0;
    for (const gasto of prevGastos.rows) {
      await pool.query(
        'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5)',
        [pid, gasto.categoria_id, targetStart, gasto.monto, gasto.descripcion]
      );
      count++;
    }

    return res.json({ success: true, data: { copied: count, source: 'previous_month' } });
  } catch (err) {
    console.error('Copy recurring error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/gastos
router.post('/gastos', async (req, res) => {
  try {
    const { categoria_id, fecha, monto, descripcion } = req.body;
    if (!categoria_id || !fecha || !monto) {
      return res.status(400).json({ success: false, error: 'categoria_id, fecha y monto son requeridos' });
    }

    // Auto-find periodo for backward compat
    const pid = await findPeriodoId(req.eid, fecha);

    const result = await pool.query(
      'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pid, categoria_id, fecha, monto, descripcion || null]
    );

    // Dual-write to transacciones for timeline
    try {
      await pool.query(
        `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, categoria_id, monto, monto_absoluto, descripcion)
         VALUES ($1, $2, $3, 'gasto', $4, $5, $6, $7, $8)`,
        [req.uid, req.eid, pid, fecha, categoria_id, -parseFloat(monto), parseFloat(monto), descripcion || null]
      );
    } catch (_) {}

    logAudit({ userId: req.user.id, entidad: 'gasto', entidadId: result.rows[0].id, accion: 'crear', descripcion: `Registro gasto de S/${monto}` });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create gasto error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/gastos/:id
router.put('/gastos/:id', async (req, res) => {
  try {
    const { categoria_id, monto, descripcion } = req.body;
    const result = await pool.query(
      'UPDATE gastos SET categoria_id = COALESCE($1, categoria_id), monto = COALESCE($2, monto), descripcion = $3 WHERE id = $4 RETURNING *',
      [categoria_id, monto, descripcion, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update gasto error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/pl/gastos/:id
router.delete('/gastos/:id', async (req, res) => {
  try {
    const gasto = await pool.query('SELECT * FROM gastos WHERE id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM gastos WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });

    // Best-effort cleanup of matching transaccion
    if (gasto.rows[0]) {
      const g = gasto.rows[0];
      try {
        await pool.query(
          `DELETE FROM transacciones WHERE ctid = (SELECT ctid FROM transacciones WHERE tipo = 'gasto' AND categoria_id = $1 AND fecha = $2 AND monto_absoluto = $3 LIMIT 1)`,
          [g.categoria_id, g.fecha, g.monto]
        );
      } catch (_) {}
    }

    return res.json({ success: true, data: { message: 'Gasto eliminado' } });
  } catch (err) {
    console.error('Delete gasto error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== COMPRAS ====================

// GET /api/pl/compras/resumen?year=2026&month=5
router.get('/compras/resumen', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT c.id) AS num_compras,
        COALESCE(SUM(ci.total), 0) AS total_compras,
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS total_insumos,
        COALESCE(SUM(CASE WHEN ci.material_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS total_materiales,
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NULL AND ci.material_id IS NULL THEN ci.total ELSE 0 END), 0) AS total_otros
       FROM compras c
       LEFT JOIN compra_items ci ON ci.compra_id = c.id
       WHERE c.empresa_id = $1 AND c.fecha >= $2 AND c.fecha <= $3`,
      [req.eid, start, end]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Compras resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/compras?year=2026&month=5
router.get('/compras', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    const compras = await pool.query(
      'SELECT * FROM compras WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3 ORDER BY fecha DESC',
      [req.eid, start, end]
    );

    // Get items for each compra
    const result = [];
    for (const compra of compras.rows) {
      const items = await pool.query(
        `SELECT ci.*,
                COALESCE(i.nombre, m.nombre, ci.nombre_item) AS item_nombre
         FROM compra_items ci
         LEFT JOIN insumos i ON i.id = ci.insumo_id
         LEFT JOIN materiales m ON m.id = ci.material_id
         WHERE ci.compra_id = $1
         ORDER BY ci.id`,
        [compra.id]
      );
      result.push({ ...compra, items: items.rows });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('List compras error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/compras — create purchase with items
router.post('/compras', async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha, proveedor, nota, items, cuenta_id } = req.body;
    if (!fecha || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'fecha y al menos un item son requeridos' });
    }

    // Auto-find periodo for backward compat
    const pid = await findPeriodoId(req.eid, fecha);

    await client.query('BEGIN');

    const total = items.reduce((s, item) => s + (parseFloat(item.precio_unitario) * parseFloat(item.cantidad)), 0);

    const compraRes = await client.query(
      'INSERT INTO compras (periodo_id, usuario_id, empresa_id, fecha, proveedor, nota, total) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [pid, req.uid, req.eid, fecha, proveedor || null, nota || null, total]
    );
    const compra = compraRes.rows[0];

    const insumosToRecalc = new Set();

    for (const item of items) {
      const itemTotal = parseFloat(item.precio_unitario) * parseFloat(item.cantidad);
      const ciRes = await client.query(
        `INSERT INTO compra_items (compra_id, insumo_id, material_id, nombre_item, cantidad, unidad, precio_unitario, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [compra.id, item.insumo_id || null, item.material_id || null, item.nombre_item || null,
         item.cantidad, item.unidad || null, item.precio_unitario, itemTotal]
      );

      // Register price history for insumos
      if (item.insumo_id) {
        const ins = await client.query('SELECT unidad_medida FROM insumos WHERE id = $1', [item.insumo_id]);
        const unidadBase = getUnidadBase(item.unidad || ins.rows[0]?.unidad_medida || 'g');
        const cantBase = aBase(parseFloat(item.cantidad), item.unidad || ins.rows[0]?.unidad_medida || 'g');
        const costoPorBase = cantBase > 0 ? itemTotal / cantBase : 0;

        await client.query(
          `INSERT INTO insumo_precios (insumo_id, compra_item_id, fecha, cantidad, cantidad_base, precio_total, costo_por_base, proveedor)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [item.insumo_id, ciRes.rows[0].id, fecha, item.cantidad, cantBase, itemTotal, costoPorBase, proveedor || null]
        );
        insumosToRecalc.add(item.insumo_id);
      }
    }

    await client.query('COMMIT');

    // Recalculate WAC for affected insumos (outside transaction for safety)
    for (const insumoId of insumosToRecalc) {
      try { await recalcularWAC(insumoId); } catch (e) { console.error('WAC recalc error:', e); }
    }

    // Dual-write to transacciones for timeline (with cuenta_id for cash flow)
    try {
      await pool.query(
        `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, compra_id, monto, monto_absoluto, descripcion, cuenta_id)
         VALUES ($1, $2, $3, 'compra', $4, $5, $6, $7, $8, $9)`,
        [req.uid, req.eid, pid, fecha, compra.id, -total, total, proveedor || null, cuenta_id || null]
      );
      // Update account balance if specified
      if (cuenta_id) {
        await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual - $1 WHERE id = $2', [total, cuenta_id]);
      }
    } catch (_) {}

    logAudit({ userId: req.user.id, entidad: 'compra', entidadId: compra.id, accion: 'crear', descripcion: `Registro compra de S/${total}${proveedor ? ' - ' + proveedor : ''}` });

    return res.status(201).json({ success: true, data: compra });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create compra error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// DELETE /api/pl/compras/:id
router.delete('/compras/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM compras WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [req.params.id, req.eid]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Compra no encontrada' });

    // Best-effort cleanup of matching transaccion
    try {
      await pool.query(
        `DELETE FROM transacciones WHERE tipo = 'compra' AND compra_id = $1`,
        [req.params.id]
      );
    } catch (_) {}

    return res.json({ success: true, data: { message: 'Compra eliminada' } });
  } catch (err) {
    console.error('Delete compra error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== CASHFLOW ====================

// GET /api/pl/cashflow/metricas?year=2026&month=5 — velocity & health metrics
router.get('/cashflow/metricas', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    // Look up saldo_inicial from matching periodo (if any)
    const periodoRes = await pool.query(
      'SELECT id, saldo_inicial, fecha_inicio, fecha_fin FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $3 ORDER BY fecha_inicio DESC LIMIT 1',
      [req.eid, start, end]
    );
    const per = periodoRes.rows[0];
    const saldoInicial = per ? (parseFloat(per.saldo_inicial) || 0) : 0;

    // Current balance
    const balRes = await pool.query(
      `SELECT COALESCE(SUM(monto), 0)::float AS total_neto
       FROM transacciones WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3 AND fecha <= CURRENT_DATE`,
      [req.eid, start, end]
    );
    const balanceActual = saldoInicial + (balRes.rows[0]?.total_neto || 0);

    // Velocity metrics
    const metricsRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END), 0)::float AS total_entradas,
        COALESCE(SUM(CASE WHEN monto < 0 THEN ABS(monto) ELSE 0 END), 0)::float AS total_salidas,
        COUNT(CASE WHEN monto > 0 THEN 1 END)::int AS num_ingresos,
        COUNT(CASE WHEN monto < 0 THEN 1 END)::int AS num_gastos,
        COUNT(DISTINCT fecha)::int AS dias_con_actividad,
        COUNT(DISTINCT CASE WHEN monto > 0 THEN fecha END)::int AS dias_con_ingreso
      FROM transacciones
      WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3
    `, [req.eid, start, end]);
    const m = metricsRes.rows[0];

    const diasTotales = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1);
    const diasTranscurridos = Math.max(1, Math.ceil((Math.min(Date.now(), new Date(end).getTime()) - new Date(start).getTime()) / 86400000) + 1);

    const promedioVentaDiaria = m.total_entradas / diasTranscurridos;
    const promedioGastoDiario = m.total_salidas / diasTranscurridos;
    const netoDiario = promedioVentaDiaria - promedioGastoDiario;
    const ratioCaja = m.total_salidas > 0 ? m.total_entradas / m.total_salidas : 0;
    const diasHastaCero = netoDiario < 0 && balanceActual > 0 ? Math.ceil(balanceActual / Math.abs(netoDiario)) : (netoDiario >= 0 ? null : 0);
    const runway = netoDiario > 0 ? null : (promedioGastoDiario > 0 ? Math.ceil(balanceActual / promedioGastoDiario) : null);

    // Health status
    let health = 'sano'; // emerald
    if (ratioCaja < 1.2 || (runway !== null && runway < 15)) health = 'atencion'; // amber
    if (ratioCaja < 0.8 || (runway !== null && runway < 7) || balanceActual < 0) health = 'critico'; // rose

    // Comparison with previous month
    const startDate = new Date(start);
    const prevMonth = startDate.getMonth(); // 0-indexed
    const prevYear = prevMonth === 0 ? startDate.getFullYear() - 1 : startDate.getFullYear();
    const prevM = prevMonth === 0 ? 12 : prevMonth;
    const prevStart = `${prevYear}-${String(prevM).padStart(2, '0')}-01`;
    const prevLastDay = new Date(prevYear, prevM, 0).getDate();
    const prevEnd = `${prevYear}-${String(prevM).padStart(2, '0')}-${prevLastDay}`;

    let comparacion = null;
    const prevPerRes = await pool.query(
      'SELECT id, saldo_inicial FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $3 ORDER BY fecha_inicio DESC LIMIT 1',
      [req.eid, prevStart, prevEnd]
    );
    const prevBal = await pool.query(
      `SELECT COALESCE(SUM(monto), 0)::float AS total FROM transacciones WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3`,
      [req.eid, prevStart, prevEnd]
    );
    const prevSaldoInicial = prevPerRes.rows[0] ? (parseFloat(prevPerRes.rows[0].saldo_inicial) || 0) : 0;
    const prevBalance = prevSaldoInicial + (prevBal.rows[0]?.total || 0);
    if (prevBalance !== 0 || prevPerRes.rows.length > 0) {
      comparacion = {
        rango_anterior: { start: prevStart, end: prevEnd },
        balance_anterior: Math.round(prevBalance * 100) / 100,
        variacion_pct: prevBalance !== 0 ? Math.round(((balanceActual - prevBalance) / Math.abs(prevBalance)) * 1000) / 10 : 0,
      };
    }

    return res.json({
      success: true,
      data: {
        rango: { start, end },
        balance_actual: Math.round(balanceActual * 100) / 100,
        promedio_venta_diaria: Math.round(promedioVentaDiaria * 100) / 100,
        promedio_gasto_diario: Math.round(promedioGastoDiario * 100) / 100,
        neto_diario: Math.round(netoDiario * 100) / 100,
        ratio_caja: Math.round(ratioCaja * 100) / 100,
        dias_hasta_cero: diasHastaCero,
        runway_dias: runway,
        health,
        dias_con_actividad: m.dias_con_actividad,
        dias_con_ingreso: m.dias_con_ingreso,
        ingreso_promedio: m.num_ingresos > 0 ? Math.round((m.total_entradas / m.num_ingresos) * 100) / 100 : 0,
        gasto_promedio: m.num_gastos > 0 ? Math.round((m.total_salidas / m.num_gastos) * 100) / 100 : 0,
        comparacion,
      },
    });
  } catch (err) {
    console.error('Cashflow metricas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/cashflow/simulacion?year=2026&month=5&monto=2500&fecha=2026-05-01
router.get('/cashflow/simulacion', async (req, res) => {
  try {
    const { monto, fecha } = req.query;
    if (!monto) return res.status(400).json({ success: false, error: 'monto requerido' });

    const { start, end } = await getDateRange(req);

    const montoCompra = parseFloat(monto);
    const fechaCompra = fecha || new Date().toISOString().slice(0, 10);

    // Look up saldo_inicial from matching periodo (if any)
    const periodoRes = await pool.query(
      'SELECT id, saldo_inicial FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $3 ORDER BY fecha_inicio DESC LIMIT 1',
      [req.eid, start, end]
    );
    const saldoInicial = periodoRes.rows[0] ? (parseFloat(periodoRes.rows[0].saldo_inicial) || 0) : 0;

    // Current balance
    const balRes = await pool.query(
      `SELECT COALESCE(SUM(monto), 0)::float AS total FROM transacciones WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= CURRENT_DATE`,
      [req.eid, start]
    );
    const balanceHoy = saldoInicial + (balRes.rows[0]?.total || 0);

    // Average daily net (last 30 days)
    const avgRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END) / GREATEST(COUNT(DISTINCT fecha), 1), 0)::float AS ingreso_diario,
        COALESCE(SUM(CASE WHEN monto < 0 THEN ABS(monto) ELSE 0 END) / GREATEST(COUNT(DISTINCT fecha), 1), 0)::float AS gasto_diario
       FROM transacciones
       WHERE empresa_id = $1 AND fecha BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE`,
      [req.eid]
    );
    const ingresoDiario = avgRes.rows[0]?.ingreso_diario || 0;
    const gastoDiario = avgRes.rows[0]?.gasto_diario || 0;
    const netoDiario = ingresoDiario - gastoDiario;

    // Upcoming recurring expenses (not yet registered this date range)
    const recurrentesRes = await pool.query(
      `SELECT cg.nombre, cg.monto_default
       FROM categorias_gasto cg
       WHERE cg.empresa_id = $1 AND cg.recurrente = true AND cg.monto_default > 0
         AND NOT EXISTS (
           SELECT 1 FROM gastos g WHERE g.categoria_id = cg.id AND g.fecha >= $2 AND g.fecha <= $3
         )`,
      [req.eid, start, end]
    );
    const gastosFijosPendientes = recurrentesRes.rows;
    const totalFijosPendientes = gastosFijosPendientes.reduce((s, r) => s + parseFloat(r.monto_default), 0);

    const balanceDespuesCompra = balanceHoy - montoCompra;
    const balanceProyectadoFinal = balanceDespuesCompra - totalFijosPendientes;
    const diasParaRecuperar = netoDiario > 0 ? Math.ceil(montoCompra / netoDiario) : null;

    let veredicto = 'ok';
    if (balanceDespuesCompra < 0) veredicto = 'peligro';
    else if (balanceProyectadoFinal < 0) veredicto = 'riesgo';
    else if (balanceDespuesCompra < montoCompra) veredicto = 'ajustado';

    return res.json({
      success: true,
      data: {
        balance_hoy: Math.round(balanceHoy * 100) / 100,
        monto_compra: montoCompra,
        balance_despues: Math.round(balanceDespuesCompra * 100) / 100,
        gastos_fijos_pendientes: gastosFijosPendientes,
        total_fijos_pendientes: Math.round(totalFijosPendientes * 100) / 100,
        balance_proyectado_final: Math.round(balanceProyectadoFinal * 100) / 100,
        ingreso_diario: Math.round(ingresoDiario * 100) / 100,
        neto_diario: Math.round(netoDiario * 100) / 100,
        dias_para_recuperar: diasParaRecuperar,
        veredicto,
      },
    });
  } catch (err) {
    console.error('Cashflow simulacion error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/cashflow?year=2026&month=5 — daily running balance
router.get('/cashflow', async (req, res) => {
  try {
    const { start, end } = await getDateRange(req);

    // Look up saldo_inicial from matching periodo (if any)
    const periodoRes = await pool.query(
      'SELECT id, saldo_inicial FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $3 ORDER BY fecha_inicio DESC LIMIT 1',
      [req.eid, start, end]
    );
    const saldoInicial = periodoRes.rows[0] ? (parseFloat(periodoRes.rows[0].saldo_inicial) || 0) : 0;

    // Daily cash flow with generate_series to fill zero-activity days
    const result = await pool.query(`
      WITH dias AS (
        SELECT d::date AS fecha
        FROM generate_series($1::date, $2::date, '1 day'::interval) d
      ),
      diario AS (
        SELECT
          t.fecha,
          SUM(CASE WHEN t.monto > 0 THEN t.monto ELSE 0 END) AS entradas,
          SUM(CASE WHEN t.monto < 0 THEN ABS(t.monto) ELSE 0 END) AS salidas,
          SUM(t.monto) AS neto
        FROM transacciones t
        WHERE t.empresa_id = $3 AND t.fecha >= $1 AND t.fecha <= $2
        GROUP BY t.fecha
      )
      SELECT
        d.fecha,
        COALESCE(di.entradas, 0)::float AS entradas,
        COALESCE(di.salidas, 0)::float AS salidas,
        COALESCE(di.neto, 0)::float AS neto,
        ($4::numeric + SUM(COALESCE(di.neto, 0)) OVER (
          ORDER BY d.fecha ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ))::float AS balance
      FROM dias d
      LEFT JOIN diario di ON di.fecha = d.fecha
      ORDER BY d.fecha
    `, [start, end, req.eid, saldoInicial]);

    // Summary
    const totalEntradas = result.rows.reduce((s, r) => s + r.entradas, 0);
    const totalSalidas = result.rows.reduce((s, r) => s + r.salidas, 0);
    const balanceActual = result.rows.length > 0 ? result.rows[result.rows.length - 1].balance : saldoInicial;

    // Find today's row for current balance (if period includes today)
    const hoy = new Date().toISOString().slice(0, 10);
    const todayRow = result.rows.find(r => r.fecha.toISOString().slice(0, 10) === hoy);
    const saldoHoy = todayRow ? todayRow.balance : balanceActual;

    // Weekly aggregation
    const weekMap = {};
    for (const row of result.rows) {
      const d = new Date(row.fecha);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1); // Monday
      const key = weekStart.toISOString().slice(0, 10);
      if (!weekMap[key]) weekMap[key] = { semana: key, entradas: 0, salidas: 0, neto: 0 };
      weekMap[key].entradas += row.entradas;
      weekMap[key].salidas += row.salidas;
      weekMap[key].neto += row.neto;
    }
    const semanal = Object.values(weekMap);
    // Add running balance to weekly
    let weekBalance = saldoInicial;
    for (const w of semanal) {
      weekBalance += w.neto;
      w.balance = weekBalance;
    }

    // Last 10 transactions for "movimientos recientes"
    const movimientos = await pool.query(
      `SELECT t.*, p.nombre AS producto_nombre, cg.nombre AS categoria_nombre
       FROM transacciones t
       LEFT JOIN productos p ON p.id = t.producto_id
       LEFT JOIN categorias_gasto cg ON cg.id = t.categoria_id
       WHERE t.empresa_id = $1 AND t.fecha >= $2 AND t.fecha <= $3
       ORDER BY t.fecha DESC, t.created_at DESC LIMIT 10`,
      [req.eid, start, end]
    );

    return res.json({
      success: true,
      data: {
        rango: { start, end },
        saldo_inicial: saldoInicial,
        saldo_actual: Math.round(saldoHoy * 100) / 100,
        total_entradas: Math.round(totalEntradas * 100) / 100,
        total_salidas: Math.round(totalSalidas * 100) / 100,
        balance_final: Math.round(balanceActual * 100) / 100,
        diario: result.rows,
        semanal,
        movimientos: movimientos.rows,
      },
    });
  } catch (err) {
    console.error('Cashflow error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
