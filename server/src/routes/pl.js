const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { aBase, getUnidadBase } = require('../utils/unidades');
const { logAudit } = require('../utils/audit');

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

// GET /api/pl/transacciones/balance?periodo_id=X — quick balance
router.get('/transacciones/balance', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    let where = 'WHERE t.empresa_id = $1';
    const params = [req.eid];
    if (periodo_id) {
      where += ' AND t.periodo_id = $2';
      params.push(periodo_id);
    }
    const result = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN t.tipo = 'venta' THEN t.monto_absoluto ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN t.tipo = 'compra' THEN t.monto_absoluto ELSE 0 END), 0) AS compras,
        COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto_absoluto ELSE 0 END), 0) AS gastos,
        COALESCE(SUM(t.monto), 0) AS balance,
        COUNT(*) AS total_transacciones
       FROM transacciones t ${where}`,
      params
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Balance error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/transacciones?periodo_id=X&tipo=venta — timeline
router.get('/transacciones', async (req, res) => {
  try {
    const { periodo_id, tipo, limit: lim } = req.query;
    let query = `SELECT t.*,
      p.nombre AS producto_nombre, p.imagen_url AS producto_imagen, p.costo_neto AS producto_costo_neto,
      cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo
     FROM transacciones t
     LEFT JOIN productos p ON p.id = t.producto_id
     LEFT JOIN categorias_gasto cg ON cg.id = t.categoria_id
     WHERE t.empresa_id = $1`;
    const params = [req.eid];
    let paramIdx = 2;

    if (periodo_id) {
      query += ` AND t.periodo_id = $${paramIdx++}`;
      params.push(periodo_id);
    }
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
    const { tipo, periodo_id, fecha, producto_id, cantidad, precio_unitario,
            descuento_tipo, descuento_valor, categoria_id, monto_absoluto,
            descripcion, nota } = req.body;

    if (!tipo || !fecha) return res.status(400).json({ success: false, error: 'tipo y fecha requeridos' });

    // Auto-assign period if not provided
    let pid = periodo_id;
    if (!pid) {
      const per = await pool.query(
        'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.eid, fecha]
      );
      pid = per.rows[0]?.id || null;
    }

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

// GET /api/pl/resumen?periodo_id=X — full P&L calculation
router.get('/resumen', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const periodo = await pool.query('SELECT * FROM periodos WHERE id = $1 AND empresa_id = $2', [periodo_id, req.eid]);
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    // Revenue
    const ventasRes = await pool.query(
      `SELECT
        COALESCE(SUM(v.total), 0) AS ingresos_brutos,
        COALESCE(SUM(v.descuento), 0) AS descuentos,
        COALESCE(SUM(v.cantidad), 0) AS unidades_vendidas,
        COUNT(*) AS num_ventas
       FROM ventas v WHERE v.periodo_id = $1`,
      [periodo_id]
    );

    // COGS from sales x product costs
    const cogsRes = await pool.query(
      `SELECT
        COALESCE(SUM(v.cantidad * p.costo_insumos), 0) AS cogs_insumos,
        COALESCE(SUM(v.cantidad * p.costo_empaque), 0) AS cogs_empaque
       FROM ventas v JOIN productos p ON p.id = v.producto_id
       WHERE v.periodo_id = $1`,
      [periodo_id]
    );

    // Expenses
    const gastosRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN cg.tipo = 'fijo' THEN g.monto ELSE 0 END), 0) AS gastos_fijos,
        COALESCE(SUM(CASE WHEN cg.tipo = 'variable' THEN g.monto ELSE 0 END), 0) AS gastos_variables
       FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE g.periodo_id = $1`,
      [periodo_id]
    );

    // Real COGS from purchases
    const comprasRes = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS compras_insumos,
        COALESCE(SUM(CASE WHEN ci.material_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS compras_materiales,
        COALESCE(SUM(ci.total), 0) AS compras_total
       FROM compras c
       LEFT JOIN compra_items ci ON ci.compra_id = c.id
       WHERE c.periodo_id = $1 AND c.empresa_id = $2`,
      [periodo_id, req.eid]
    );
    const comp = comprasRes.rows[0];

    // Top products
    const topProductos = await pool.query(
      `SELECT p.id, p.nombre, p.imagen_url,
              SUM(v.cantidad) AS unidades, SUM(v.total) AS ingresos,
              SUM(v.cantidad * p.costo_neto) AS costo_total,
              SUM(v.total) - SUM(v.cantidad * p.costo_neto) AS utilidad
       FROM ventas v JOIN productos p ON p.id = v.producto_id
       WHERE v.periodo_id = $1
       GROUP BY p.id, p.nombre, p.imagen_url
       ORDER BY ingresos DESC LIMIT 10`,
      [periodo_id]
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
        SELECT 'producto' AS tipo, perdida_total AS total FROM desmedros_producto WHERE periodo_id = $1 AND empresa_id = $2
        UNION ALL
        SELECT 'preparacion', perdida_total FROM desmedros_preparacion WHERE periodo_id = $1 AND empresa_id = $2
        UNION ALL
        SELECT 'insumo', perdida_total FROM desmedros_insumo WHERE periodo_id = $1 AND empresa_id = $2
        UNION ALL
        SELECT 'material', perdida_total FROM desmedros_material WHERE periodo_id = $1 AND empresa_id = $2
       ) t`,
      [periodo_id, req.eid]
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
        periodo: periodo.rows[0],
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

    // Auto-create current month periodo if missing (match by date range, not name)
    const MESES_PL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const now = new Date(Date.now() - 5*60*60*1000); // Lima time (UTC-5)
    const y = now.getFullYear();
    const m = now.getMonth();
    const inicioStr = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const exists = result.rows.find(p => {
      if (!p.fecha_inicio) return false;
      const fi = typeof p.fecha_inicio === 'string' ? p.fecha_inicio : p.fecha_inicio.toISOString();
      return fi.startsWith(inicioStr);
    });
    if (!exists && req.eid) {
      const lastDay = new Date(y, m+1, 0).getDate();
      const finStr = `${y}-${String(m+1).padStart(2,'0')}-${lastDay}`;
      try {
        const newP = await pool.query(
          'INSERT INTO periodos (empresa_id, usuario_id, nombre, tipo, fecha_inicio, fecha_fin) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [req.eid, req.uid, `${MESES_PL[m]} ${y}`, 'mensual', inicioStr, finStr]
        );
        result.rows.unshift(newP.rows[0]);
      } catch(e) { /* unique constraint idx_periodos_empresa_nombre prevents duplicates */ }
    }

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

// GET /api/pl/ventas?periodo_id=X
router.get('/ventas', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    // Verify period belongs to user
    const periodo = await pool.query('SELECT id FROM periodos WHERE id = $1 AND empresa_id = $2', [periodo_id, req.eid]);
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    const result = await pool.query(
      `SELECT v.*, p.nombre AS producto_nombre, p.costo_neto AS producto_costo_neto,
              p.costo_insumos AS producto_costo_insumos, p.costo_empaque AS producto_costo_empaque,
              p.imagen_url AS producto_imagen
       FROM ventas v
       JOIN productos p ON p.id = v.producto_id
       WHERE v.periodo_id = $1
       ORDER BY v.fecha DESC, v.created_at DESC`,
      [periodo_id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List ventas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/ventas
router.post('/ventas', async (req, res) => {
  try {
    const { periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, nota, cuenta_id,
            tipo_envio, costo_envio, zona_envio_id, direccion_envio, canal_id, cliente_id } = req.body;
    if (!periodo_id || !producto_id || !fecha || !cantidad) {
      return res.status(400).json({ success: false, error: 'periodo_id, producto_id, fecha y cantidad son requeridos' });
    }

    const periodo = await pool.query('SELECT id FROM periodos WHERE id = $1 AND empresa_id = $2', [periodo_id, req.eid]);
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    // Get product price if not provided
    const prod = await pool.query('SELECT precio_final, costo_neto FROM productos WHERE id = $1 AND empresa_id = $2', [producto_id, req.eid]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const precio = precio_unitario || parseFloat(prod.rows[0].precio_final);
    const desc = parseFloat(descuento) || 0;
    const costoEnvio = parseFloat(costo_envio) || 0;
    const total = (precio * parseInt(cantidad)) - desc + costoEnvio;

    const result = await pool.query(
      `INSERT INTO ventas (empresa_id, periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, total, nota,
        tipo_envio, costo_envio, zona_envio_id, direccion_envio, canal_id, cliente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [req.eid, periodo_id, producto_id, fecha, cantidad, precio, desc, total, nota || null,
        tipo_envio || null, costoEnvio, zona_envio_id || null, direccion_envio || null, canal_id || null, cliente_id || null]
    );

    // Dual-write to transacciones for timeline (with cuenta_id for cash flow)
    try {
      await pool.query(
        `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, producto_id, cantidad, precio_unitario, descuento, monto, monto_absoluto, descripcion, cuenta_id)
         VALUES ($1, $2, $3, 'venta', $4, $5, $6, $7, $8, $9, $9, $10, $11)`,
        [req.uid, req.eid, periodo_id, fecha, producto_id, cantidad, precio, desc, total, nota || null, cuenta_id || null]
      );
      // Update account balance if specified
      if (cuenta_id) {
        await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2', [total, cuenta_id]);
      }
    } catch (_) {}

    logAudit({ userId: req.user.id, entidad: 'venta', entidadId: result.rows[0].id, accion: 'crear', descripcion: `Registro venta de ${cantidad} unidad(es)` });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create venta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/ventas/resumen?periodo_id=X — summary totals (MUST be before /:id)
router.get('/ventas/resumen', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const result = await pool.query(
      `SELECT
        COUNT(*) AS total_ventas,
        COALESCE(SUM(v.total), 0) AS ingresos_brutos,
        COALESCE(SUM(v.descuento), 0) AS descuentos,
        COALESCE(SUM(v.total), 0) - COALESCE(SUM(v.descuento), 0) AS ingresos_netos,
        COALESCE(SUM(v.cantidad * p.costo_neto), 0) AS cogs_total,
        COALESCE(SUM(v.cantidad * p.costo_insumos), 0) AS cogs_insumos,
        COALESCE(SUM(v.cantidad * p.costo_empaque), 0) AS cogs_empaque,
        COALESCE(SUM(v.cantidad), 0) AS unidades_vendidas
       FROM ventas v
       JOIN productos p ON p.id = v.producto_id
       WHERE v.periodo_id = $1`,
      [periodo_id]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Ventas resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pl/ventas/:id
router.put('/ventas/:id', async (req, res) => {
  try {
    const { cantidad, precio_unitario, descuento, nota, fecha, cliente_id, canal_id, cuenta_id,
            tipo_envio, costo_envio, zona_envio_id, direccion_envio } = req.body;

    const existing = await pool.query('SELECT * FROM ventas WHERE id = $1 AND empresa_id = $2', [req.params.id, req.eid]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    const prev = existing.rows[0];

    const precio = precio_unitario != null ? parseFloat(precio_unitario) : parseFloat(prev.precio_unitario);
    const cant = cantidad != null ? parseInt(cantidad) : parseInt(prev.cantidad);
    const desc = descuento != null ? parseFloat(descuento) : parseFloat(prev.descuento || 0);
    const envio = costo_envio != null ? parseFloat(costo_envio) : parseFloat(prev.costo_envio || 0);
    const total = (precio * cant) - desc + envio;

    const result = await pool.query(
      `UPDATE ventas SET
        cantidad = $1, precio_unitario = $2, descuento = $3, total = $4,
        nota = COALESCE($5, nota),
        fecha = COALESCE($6, fecha),
        cliente_id = $7,
        canal_id = $8,
        tipo_envio = $9,
        costo_envio = $10,
        zona_envio_id = $11,
        direccion_envio = $12,
        updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [cant, precio, desc, total,
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
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update venta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
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
          `DELETE FROM transacciones WHERE tipo = 'venta' AND producto_id = $1 AND fecha = $2 AND periodo_id = $3 AND monto_absoluto = $4 LIMIT 1`,
          [v.producto_id, v.fecha, v.periodo_id, v.total]
        ).catch(() => {
          // PostgreSQL doesn't support LIMIT in DELETE, use ctid
          pool.query(
            `DELETE FROM transacciones WHERE ctid = (SELECT ctid FROM transacciones WHERE tipo = 'venta' AND producto_id = $1 AND fecha = $2 AND periodo_id = $3 AND monto_absoluto = $4 LIMIT 1)`,
            [v.producto_id, v.fecha, v.periodo_id, v.total]
          );
        });
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

// GET /api/pl/gastos/resumen?periodo_id=X — summary by category
// PUT THIS BEFORE /:id ROUTES
router.get('/gastos/resumen', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const result = await pool.query(
      `SELECT
        cg.id AS categoria_id, cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo,
        COALESCE(SUM(g.monto), 0) AS total
       FROM categorias_gasto cg
       LEFT JOIN gastos g ON g.categoria_id = cg.id AND g.periodo_id = $1
       WHERE cg.empresa_id = $2 AND cg.activa = true
       GROUP BY cg.id, cg.nombre, cg.tipo
       ORDER BY cg.orden, cg.nombre`,
      [periodo_id, req.eid]
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

// GET /api/pl/gastos?periodo_id=X
router.get('/gastos', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const result = await pool.query(
      `SELECT g.*, cg.nombre AS categoria_nombre, cg.tipo AS categoria_tipo
       FROM gastos g
       JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE g.periodo_id = $1
       ORDER BY g.fecha DESC, g.created_at DESC`,
      [periodo_id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List gastos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/gastos/copiar-recurrentes — copy recurring expenses from previous period
router.post('/gastos/copiar-recurrentes', async (req, res) => {
  try {
    const { periodo_id } = req.body;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    // Get previous period
    const currentPeriod = await pool.query('SELECT * FROM periodos WHERE id = $1 AND empresa_id = $2', [periodo_id, req.eid]);
    if (currentPeriod.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    const prevPeriod = await pool.query(
      'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_fin < $2 ORDER BY fecha_fin DESC LIMIT 1',
      [req.eid, currentPeriod.rows[0].fecha_inicio]
    );

    if (prevPeriod.rows.length === 0) {
      // No previous period — use category defaults
      const cats = await pool.query(
        'SELECT id, monto_default FROM categorias_gasto WHERE empresa_id = $1 AND recurrente = true AND monto_default IS NOT NULL AND monto_default > 0',
        [req.eid]
      );
      let count = 0;
      for (const cat of cats.rows) {
        await pool.query(
          'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5)',
          [periodo_id, cat.id, currentPeriod.rows[0].fecha_inicio, cat.monto_default, 'Gasto recurrente (default)']
        );
        count++;
      }
      return res.json({ success: true, data: { copied: count, source: 'defaults' } });
    }

    // Copy from previous period — only recurring categories
    const prevGastos = await pool.query(
      `SELECT g.categoria_id, g.monto, g.descripcion
       FROM gastos g
       JOIN categorias_gasto cg ON cg.id = g.categoria_id
       WHERE g.periodo_id = $1 AND cg.recurrente = true`,
      [prevPeriod.rows[0].id]
    );

    let count = 0;
    for (const gasto of prevGastos.rows) {
      await pool.query(
        'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5)',
        [periodo_id, gasto.categoria_id, currentPeriod.rows[0].fecha_inicio, gasto.monto, gasto.descripcion]
      );
      count++;
    }

    return res.json({ success: true, data: { copied: count, source: 'previous_period' } });
  } catch (err) {
    console.error('Copy recurring error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pl/gastos
router.post('/gastos', async (req, res) => {
  try {
    const { periodo_id, categoria_id, fecha, monto, descripcion } = req.body;
    if (!periodo_id || !categoria_id || !fecha || !monto) {
      return res.status(400).json({ success: false, error: 'periodo_id, categoria_id, fecha y monto son requeridos' });
    }

    const result = await pool.query(
      'INSERT INTO gastos (periodo_id, categoria_id, fecha, monto, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [periodo_id, categoria_id, fecha, monto, descripcion || null]
    );

    // Dual-write to transacciones for timeline
    try {
      await pool.query(
        `INSERT INTO transacciones (usuario_id, empresa_id, periodo_id, tipo, fecha, categoria_id, monto, monto_absoluto, descripcion)
         VALUES ($1, $2, $3, 'gasto', $4, $5, $6, $7, $8)`,
        [req.uid, req.eid, periodo_id, fecha, categoria_id, -parseFloat(monto), parseFloat(monto), descripcion || null]
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
          `DELETE FROM transacciones WHERE ctid = (SELECT ctid FROM transacciones WHERE tipo = 'gasto' AND categoria_id = $1 AND fecha = $2 AND periodo_id = $3 AND monto_absoluto = $4 LIMIT 1)`,
          [g.categoria_id, g.fecha, g.periodo_id, g.monto]
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

// GET /api/pl/compras/resumen?periodo_id=X
router.get('/compras/resumen', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT c.id) AS num_compras,
        COALESCE(SUM(ci.total), 0) AS total_compras,
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS total_insumos,
        COALESCE(SUM(CASE WHEN ci.material_id IS NOT NULL THEN ci.total ELSE 0 END), 0) AS total_materiales,
        COALESCE(SUM(CASE WHEN ci.insumo_id IS NULL AND ci.material_id IS NULL THEN ci.total ELSE 0 END), 0) AS total_otros
       FROM compras c
       LEFT JOIN compra_items ci ON ci.compra_id = c.id
       WHERE c.periodo_id = $1 AND c.empresa_id = $2`,
      [periodo_id, req.eid]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Compras resumen error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pl/compras?periodo_id=X
router.get('/compras', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const compras = await pool.query(
      'SELECT * FROM compras WHERE periodo_id = $1 AND empresa_id = $2 ORDER BY fecha DESC',
      [periodo_id, req.eid]
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
    const { periodo_id, fecha, proveedor, nota, items, cuenta_id } = req.body;
    if (!periodo_id || !fecha || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'periodo_id, fecha y al menos un item son requeridos' });
    }

    await client.query('BEGIN');

    const total = items.reduce((s, item) => s + (parseFloat(item.precio_unitario) * parseFloat(item.cantidad)), 0);

    const compraRes = await client.query(
      'INSERT INTO compras (periodo_id, usuario_id, empresa_id, fecha, proveedor, nota, total) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [periodo_id, req.uid, req.eid, fecha, proveedor || null, nota || null, total]
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
        [req.uid, req.eid, periodo_id, fecha, compra.id, -total, total, proveedor || null, cuenta_id || null]
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

// GET /api/pl/cashflow/metricas?periodo_id=X — velocity & health metrics
router.get('/cashflow/metricas', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const periodo = await pool.query(
      'SELECT * FROM periodos WHERE id = $1 AND empresa_id = $2',
      [periodo_id, req.eid]
    );
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    const per = periodo.rows[0];
    const saldoInicial = parseFloat(per.saldo_inicial) || 0;

    // Current balance
    const balRes = await pool.query(
      `SELECT COALESCE(SUM(monto), 0)::float AS total_neto
       FROM transacciones WHERE periodo_id = $1 AND empresa_id = $2 AND fecha <= CURRENT_DATE`,
      [periodo_id, req.eid]
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
      WHERE periodo_id = $1 AND empresa_id = $2
    `, [periodo_id, req.eid]);
    const m = metricsRes.rows[0];

    const diasTotales = Math.max(1, Math.ceil((new Date(per.fecha_fin) - new Date(per.fecha_inicio)) / 86400000) + 1);
    const diasTranscurridos = Math.max(1, Math.ceil((Math.min(Date.now(), new Date(per.fecha_fin).getTime()) - new Date(per.fecha_inicio).getTime()) / 86400000) + 1);

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

    // Comparison with previous period
    const prevPer = await pool.query(
      'SELECT id, saldo_inicial FROM periodos WHERE empresa_id = $1 AND fecha_fin < $2 ORDER BY fecha_fin DESC LIMIT 1',
      [req.eid, per.fecha_inicio]
    );
    let comparacion = null;
    if (prevPer.rows.length > 0) {
      const prevBal = await pool.query(
        `SELECT COALESCE(SUM(monto), 0)::float AS total FROM transacciones WHERE periodo_id = $1 AND empresa_id = $2`,
        [prevPer.rows[0].id, req.eid]
      );
      const prevBalance = (parseFloat(prevPer.rows[0].saldo_inicial) || 0) + (prevBal.rows[0]?.total || 0);
      comparacion = {
        periodo_anterior: prevPer.rows[0].id,
        balance_anterior: Math.round(prevBalance * 100) / 100,
        variacion_pct: prevBalance !== 0 ? Math.round(((balanceActual - prevBalance) / Math.abs(prevBalance)) * 1000) / 10 : 0,
      };
    }

    return res.json({
      success: true,
      data: {
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

// GET /api/pl/cashflow/simulacion?periodo_id=X&monto=2500&fecha=2026-05-01
router.get('/cashflow/simulacion', async (req, res) => {
  try {
    const { periodo_id, monto, fecha } = req.query;
    if (!periodo_id || !monto) return res.status(400).json({ success: false, error: 'periodo_id y monto requeridos' });

    const montoCompra = parseFloat(monto);
    const fechaCompra = fecha || new Date().toISOString().slice(0, 10);

    const periodo = await pool.query(
      'SELECT * FROM periodos WHERE id = $1 AND empresa_id = $2',
      [periodo_id, req.eid]
    );
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    const per = periodo.rows[0];
    const saldoInicial = parseFloat(per.saldo_inicial) || 0;

    // Current balance
    const balRes = await pool.query(
      `SELECT COALESCE(SUM(monto), 0)::float AS total FROM transacciones WHERE periodo_id = $1 AND empresa_id = $2 AND fecha <= CURRENT_DATE`,
      [periodo_id, req.eid]
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

    // Upcoming recurring expenses (not yet registered this period)
    const recurrentesRes = await pool.query(
      `SELECT cg.nombre, cg.monto_default
       FROM categorias_gasto cg
       WHERE cg.empresa_id = $1 AND cg.recurrente = true AND cg.monto_default > 0
         AND NOT EXISTS (
           SELECT 1 FROM gastos g WHERE g.categoria_id = cg.id AND g.periodo_id = $2
         )`,
      [req.eid, periodo_id]
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

// GET /api/pl/cashflow?periodo_id=X — daily running balance
router.get('/cashflow', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const periodo = await pool.query(
      'SELECT * FROM periodos WHERE id = $1 AND empresa_id = $2',
      [periodo_id, req.eid]
    );
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    const per = periodo.rows[0];
    const saldoInicial = parseFloat(per.saldo_inicial) || 0;

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
        WHERE t.periodo_id = $3 AND t.empresa_id = $4
        GROUP BY t.fecha
      )
      SELECT
        d.fecha,
        COALESCE(di.entradas, 0)::float AS entradas,
        COALESCE(di.salidas, 0)::float AS salidas,
        COALESCE(di.neto, 0)::float AS neto,
        ($5::numeric + SUM(COALESCE(di.neto, 0)) OVER (
          ORDER BY d.fecha ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ))::float AS balance
      FROM dias d
      LEFT JOIN diario di ON di.fecha = d.fecha
      ORDER BY d.fecha
    `, [per.fecha_inicio, per.fecha_fin, periodo_id, req.eid, saldoInicial]);

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
       WHERE t.periodo_id = $1 AND t.empresa_id = $2
       ORDER BY t.fecha DESC, t.created_at DESC LIMIT 10`,
      [periodo_id, req.eid]
    );

    return res.json({
      success: true,
      data: {
        periodo: per,
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
