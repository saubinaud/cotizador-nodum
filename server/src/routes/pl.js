const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

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

module.exports = router;
