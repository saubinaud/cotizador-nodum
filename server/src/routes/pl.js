const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ==================== P&L RESUMEN ====================

// GET /api/pl/resumen?periodo_id=X — full P&L calculation
router.get('/resumen', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const periodo = await pool.query('SELECT * FROM periodos WHERE id = $1 AND usuario_id = $2', [periodo_id, req.user.id]);
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
       WHERE c.periodo_id = $1 AND c.usuario_id = $2`,
      [periodo_id, req.user.id]
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
    const utilidad_operativa = utilidad_bruta - gastos_total;

    // IGV calculation
    const user = await pool.query('SELECT igv_rate, tipo_negocio FROM usuarios WHERE id = $1', [req.user.id]);
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
      'SELECT * FROM periodos WHERE usuario_id = $1 ORDER BY fecha_inicio DESC',
      [req.user.id]
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
    const result = await pool.query(
      'INSERT INTO periodos (usuario_id, nombre, tipo, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, nombre, tipo || 'mensual', fecha_inicio, fecha_fin]
    );

    // Seed default expense categories if first period
    const catCount = await pool.query('SELECT COUNT(*) FROM categorias_gasto WHERE usuario_id = $1', [req.user.id]);
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
          'INSERT INTO categorias_gasto (usuario_id, nombre, tipo, recurrente, orden) VALUES ($1, $2, $3, $4, $5)',
          [req.user.id, cat.nombre, cat.tipo, cat.recurrente, cat.orden]
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
      'UPDATE periodos SET nombre = COALESCE($1, nombre), estado = COALESCE($2, estado) WHERE id = $3 AND usuario_id = $4 RETURNING *',
      [nombre, estado, req.params.id, req.user.id]
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
    const result = await pool.query('DELETE FROM periodos WHERE id = $1 AND usuario_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });
    return res.json({ success: true, data: { message: 'Periodo eliminado' } });
  } catch (err) {
    console.error('Delete periodo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== CATEGORIAS GASTO ====================

// GET /api/pl/categorias
router.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias_gasto WHERE usuario_id = $1 AND activa = true ORDER BY orden, nombre',
      [req.user.id]
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
      'INSERT INTO categorias_gasto (usuario_id, nombre, tipo, recurrente, monto_default) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, nombre, tipo || 'variable', recurrente || false, monto_default || null]
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
       WHERE id = $6 AND usuario_id = $7 RETURNING *`,
      [nombre, tipo, recurrente, monto_default, activa, req.params.id, req.user.id]
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
    const periodo = await pool.query('SELECT id FROM periodos WHERE id = $1 AND usuario_id = $2', [periodo_id, req.user.id]);
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
    const { periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, nota } = req.body;
    if (!periodo_id || !producto_id || !fecha || !cantidad) {
      return res.status(400).json({ success: false, error: 'periodo_id, producto_id, fecha y cantidad son requeridos' });
    }

    const periodo = await pool.query('SELECT id FROM periodos WHERE id = $1 AND usuario_id = $2', [periodo_id, req.user.id]);
    if (periodo.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    // Get product price if not provided
    const prod = await pool.query('SELECT precio_final, costo_neto FROM productos WHERE id = $1 AND usuario_id = $2', [producto_id, req.user.id]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const precio = precio_unitario || parseFloat(prod.rows[0].precio_final);
    const desc = parseFloat(descuento) || 0;
    const total = (precio * parseInt(cantidad)) - desc;

    const result = await pool.query(
      `INSERT INTO ventas (periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, total, nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [periodo_id, producto_id, fecha, cantidad, precio, desc, total, nota || null]
    );

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
    const { cantidad, precio_unitario, descuento, nota } = req.body;
    const precio = parseFloat(precio_unitario) || 0;
    const cant = parseInt(cantidad) || 1;
    const desc = parseFloat(descuento) || 0;
    const total = (precio * cant) - desc;

    const result = await pool.query(
      `UPDATE ventas SET cantidad = $1, precio_unitario = $2, descuento = $3, total = $4, nota = $5
       WHERE id = $6 RETURNING *`,
      [cant, precio, desc, total, nota || null, req.params.id]
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
    const result = await pool.query('DELETE FROM ventas WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
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
       WHERE cg.usuario_id = $2 AND cg.activa = true
       GROUP BY cg.id, cg.nombre, cg.tipo
       ORDER BY cg.orden, cg.nombre`,
      [periodo_id, req.user.id]
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
    const currentPeriod = await pool.query('SELECT * FROM periodos WHERE id = $1 AND usuario_id = $2', [periodo_id, req.user.id]);
    if (currentPeriod.rows.length === 0) return res.status(404).json({ success: false, error: 'Periodo no encontrado' });

    const prevPeriod = await pool.query(
      'SELECT id FROM periodos WHERE usuario_id = $1 AND fecha_fin < $2 ORDER BY fecha_fin DESC LIMIT 1',
      [req.user.id, currentPeriod.rows[0].fecha_inicio]
    );

    if (prevPeriod.rows.length === 0) {
      // No previous period — use category defaults
      const cats = await pool.query(
        'SELECT id, monto_default FROM categorias_gasto WHERE usuario_id = $1 AND recurrente = true AND monto_default IS NOT NULL AND monto_default > 0',
        [req.user.id]
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
    const result = await pool.query('DELETE FROM gastos WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
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
       WHERE c.periodo_id = $1 AND c.usuario_id = $2`,
      [periodo_id, req.user.id]
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
      'SELECT * FROM compras WHERE periodo_id = $1 AND usuario_id = $2 ORDER BY fecha DESC',
      [periodo_id, req.user.id]
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
    const { periodo_id, fecha, proveedor, nota, items } = req.body;
    if (!periodo_id || !fecha || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'periodo_id, fecha y al menos un item son requeridos' });
    }

    await client.query('BEGIN');

    const total = items.reduce((s, item) => s + (parseFloat(item.precio_unitario) * parseFloat(item.cantidad)), 0);

    const compraRes = await client.query(
      'INSERT INTO compras (periodo_id, usuario_id, fecha, proveedor, nota, total) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [periodo_id, req.user.id, fecha, proveedor || null, nota || null, total]
    );
    const compra = compraRes.rows[0];

    for (const item of items) {
      const itemTotal = parseFloat(item.precio_unitario) * parseFloat(item.cantidad);
      await client.query(
        `INSERT INTO compra_items (compra_id, insumo_id, material_id, nombre_item, cantidad, unidad, precio_unitario, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [compra.id, item.insumo_id || null, item.material_id || null, item.nombre_item || null,
         item.cantidad, item.unidad || null, item.precio_unitario, itemTotal]
      );
    }

    await client.query('COMMIT');
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
      'DELETE FROM compras WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    return res.json({ success: true, data: { message: 'Compra eliminada' } });
  } catch (err) {
    console.error('Delete compra error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
