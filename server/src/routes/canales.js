const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/canales
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM canales_distribucion WHERE usuario_id = $1 AND activo = true ORDER BY orden, nombre',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List canales error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/canales
router.post('/', async (req, res) => {
  try {
    const { nombre, comision_pct, markup_tipo, markup_valor } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const result = await pool.query(
      `INSERT INTO canales_distribucion (usuario_id, nombre, comision_pct, markup_tipo, markup_valor)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, nombre, parseFloat(comision_pct) || 0, markup_tipo || 'pct', parseFloat(markup_valor) || 0]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create canal error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/canales/:id
router.put('/:id', async (req, res) => {
  try {
    const { nombre, comision_pct, markup_tipo, markup_valor, activo } = req.body;
    const result = await pool.query(
      `UPDATE canales_distribucion SET
        nombre = COALESCE($1, nombre), comision_pct = COALESCE($2, comision_pct),
        markup_tipo = COALESCE($3, markup_tipo), markup_valor = COALESCE($4, markup_valor),
        activo = COALESCE($5, activo)
       WHERE id = $6 AND usuario_id = $7 RETURNING *`,
      [nombre, comision_pct != null ? parseFloat(comision_pct) : null, markup_tipo, markup_valor != null ? parseFloat(markup_valor) : null, activo, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Canal no encontrado' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update canal error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/canales/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE canales_distribucion SET activo = false WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    return res.json({ success: true, data: { message: 'Canal eliminado' } });
  } catch (err) {
    console.error('Delete canal error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/canales/precios/:productoId — calculated prices per channel for a product
router.get('/precios/:productoId', async (req, res) => {
  try {
    const producto = await pool.query(
      'SELECT id, nombre, precio_venta, precio_final FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.productoId, req.user.id]
    );
    if (producto.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    const p = producto.rows[0];
    const precioTienda = parseFloat(p.precio_final) || 0;

    const canales = await pool.query(
      'SELECT * FROM canales_distribucion WHERE usuario_id = $1 AND activo = true ORDER BY orden',
      [req.user.id]
    );

    const overrides = await pool.query(
      'SELECT * FROM producto_canal_precio WHERE producto_id = $1',
      [req.params.productoId]
    );
    const overrideMap = {};
    for (const o of overrides.rows) overrideMap[o.canal_id] = parseFloat(o.precio_override);

    const precios = canales.rows.map(canal => {
      const comision = parseFloat(canal.comision_pct) || 0;
      const precioBase = comision < 100 ? precioTienda / (1 - comision / 100) : precioTienda;
      let precioFinal;
      if (canal.markup_tipo === 'fijo') {
        precioFinal = precioBase + (parseFloat(canal.markup_valor) || 0);
      } else {
        precioFinal = precioBase * (1 + (parseFloat(canal.markup_valor) || 0) / 100);
      }

      return {
        canal_id: canal.id,
        canal_nombre: canal.nombre,
        comision_pct: comision,
        markup_tipo: canal.markup_tipo,
        markup_valor: parseFloat(canal.markup_valor) || 0,
        precio_calculado: Math.round(precioFinal * 100) / 100,
        precio_override: overrideMap[canal.id] || null,
        precio_final: overrideMap[canal.id] || Math.round(precioFinal * 100) / 100,
      };
    });

    return res.json({ success: true, data: { producto: p, precio_tienda: precioTienda, canales: precios } });
  } catch (err) {
    console.error('Precios canal error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/canales/precios/:productoId — set price override per channel
router.put('/precios/:productoId', async (req, res) => {
  try {
    const { canal_id, precio_override } = req.body;
    if (!canal_id) return res.status(400).json({ success: false, error: 'canal_id requerido' });

    if (precio_override != null) {
      await pool.query(
        `INSERT INTO producto_canal_precio (producto_id, canal_id, precio_override) VALUES ($1, $2, $3)
         ON CONFLICT (producto_id, canal_id) DO UPDATE SET precio_override = $3`,
        [req.params.productoId, canal_id, parseFloat(precio_override)]
      );
    } else {
      await pool.query('DELETE FROM producto_canal_precio WHERE producto_id = $1 AND canal_id = $2', [req.params.productoId, canal_id]);
    }

    return res.json({ success: true, data: { message: 'Precio actualizado' } });
  } catch (err) {
    console.error('Set precio canal error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== ZONAS DE ENVÍO ====================

// GET /api/canales/zonas
router.get('/zonas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM zonas_envio WHERE usuario_id = $1 AND activo = true ORDER BY orden, nombre',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List zonas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/canales/zonas
router.post('/zonas', async (req, res) => {
  try {
    const { nombre, costo } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const result = await pool.query(
      'INSERT INTO zonas_envio (usuario_id, nombre, costo) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, nombre, parseFloat(costo) || 0]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create zona error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/canales/zonas/:id
router.put('/zonas/:id', async (req, res) => {
  try {
    const { nombre, costo, activo } = req.body;
    const result = await pool.query(
      `UPDATE zonas_envio SET nombre = COALESCE($1, nombre), costo = COALESCE($2, costo), activo = COALESCE($3, activo)
       WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [nombre, costo != null ? parseFloat(costo) : null, activo, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Zona no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update zona error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/canales/zonas/:id
router.delete('/zonas/:id', async (req, res) => {
  try {
    await pool.query('UPDATE zonas_envio SET activo = false WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    return res.json({ success: true, data: { message: 'Zona eliminada' } });
  } catch (err) {
    console.error('Delete zona error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
