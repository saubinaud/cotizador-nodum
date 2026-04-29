const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

// GET /api/pedidos — list orders
router.get('/', async (req, res) => {
  try {
    const { estado, limit: lim } = req.query;
    let query = `SELECT p.*, c.num_doc AS cliente_doc, c.razon_social AS cliente_nombre
     FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
     WHERE p.usuario_id = $1`;
    const params = [req.user.id];
    let idx = 2;

    if (estado) {
      query += ` AND p.estado = $${idx++}`;
      params.push(estado);
    }

    query += ' ORDER BY p.fecha_pedido DESC';
    if (lim) {
      query += ` LIMIT $${idx++}`;
      params.push(parseInt(lim));
    }

    const result = await pool.query(query, params);

    // Get payments for each pedido
    for (const p of result.rows) {
      const pagos = await pool.query(
        'SELECT * FROM pagos_pedido WHERE pedido_id = $1 ORDER BY fecha ASC',
        [p.id]
      );
      p.pagos = pagos.rows;
      p.monto_pendiente = parseFloat(p.monto_total) - parseFloat(p.monto_pagado);
    }

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List pedidos error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pedidos/pendientes — quick view of orders with pending balance
router.get('/pendientes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.razon_social AS cliente_nombre
       FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.usuario_id = $1 AND p.estado NOT IN ('pagado', 'cancelado')
       ORDER BY p.fecha_entrega_estimada ASC NULLS LAST`,
      [req.user.id]
    );

    const totalPendiente = result.rows.reduce((s, p) => s + parseFloat(p.monto_total) - parseFloat(p.monto_pagado), 0);
    const hoy = new Date().toISOString().slice(0, 10);
    const entregasHoy = result.rows.filter(p => p.fecha_entrega_estimada && p.fecha_entrega_estimada.toISOString().slice(0, 10) === hoy).length;

    return res.json({
      success: true,
      data: {
        pedidos: result.rows,
        resumen: {
          total_pendiente: Math.round(totalPendiente * 100) / 100,
          entregas_hoy: entregasHoy,
          pedidos_activos: result.rows.length,
        },
      },
    });
  } catch (err) {
    console.error('Pedidos pendientes error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/pedidos/:id — detail with all payments
router.get('/:id', async (req, res) => {
  try {
    const pedido = await pool.query(
      `SELECT p.*, c.num_doc AS cliente_doc, c.razon_social AS cliente_nombre, c.telefono AS cliente_telefono
       FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = $1 AND p.usuario_id = $2`,
      [req.params.id, req.user.id]
    );
    if (pedido.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    const pagos = await pool.query(
      `SELECT pp.*, fc.nombre AS cuenta_nombre
       FROM pagos_pedido pp LEFT JOIN flujo_cuentas fc ON fc.id = pp.cuenta_id
       WHERE pp.pedido_id = $1 ORDER BY pp.fecha ASC`,
      [req.params.id]
    );

    const p = pedido.rows[0];
    p.pagos = pagos.rows;
    p.monto_pendiente = parseFloat(p.monto_total) - parseFloat(p.monto_pagado);

    return res.json({ success: true, data: p });
  } catch (err) {
    console.error('Get pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pedidos — create order (with optional first payment)
router.post('/', async (req, res) => {
  try {
    const { cliente_id, descripcion, items, monto_total, tipo_pago,
            fecha_entrega_estimada, notas, adelanto, metodo_pago, cuenta_id } = req.body;

    if (!descripcion || !monto_total) {
      return res.status(400).json({ success: false, error: 'Descripción y monto total requeridos' });
    }

    const pedidoRes = await pool.query(
      `INSERT INTO pedidos (usuario_id, cliente_id, descripcion, items_json, monto_total, tipo_pago, fecha_entrega_estimada, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, cliente_id || null, descripcion, items ? JSON.stringify(items) : null,
       parseFloat(monto_total), tipo_pago || 'contado', fecha_entrega_estimada || null, notas || null, req.user.id]
    );
    const pedido = pedidoRes.rows[0];

    // If contra_entrega with adelanto, register first payment
    if (tipo_pago === 'contra_entrega' && adelanto && parseFloat(adelanto) > 0) {
      const adelantoMonto = parseFloat(adelanto);

      // Create transaction in cash flow
      let transaccionId = null;
      try {
        const txRes = await pool.query(
          `INSERT INTO transacciones (usuario_id, tipo, fecha, monto, monto_absoluto, descripcion, cuenta_id)
           VALUES ($1, 'venta', CURRENT_DATE, $2, $2, $3, $4) RETURNING id`,
          [req.user.id, adelantoMonto, `Adelanto pedido #${pedido.id}: ${descripcion}`, cuenta_id || null]
        );
        transaccionId = txRes.rows[0].id;

        // Update account balance if specified
        if (cuenta_id) {
          await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2', [adelantoMonto, cuenta_id]);
        }
      } catch (_) {}

      await pool.query(
        `INSERT INTO pagos_pedido (pedido_id, monto, metodo_pago, cuenta_id, tipo, transaccion_id, created_by)
         VALUES ($1, $2, $3, $4, 'adelanto', $5, $6)`,
        [pedido.id, adelantoMonto, metodo_pago || 'efectivo', cuenta_id || null, transaccionId, req.user.id]
      );
    }

    // If contado (full payment), register full payment
    if (tipo_pago === 'contado') {
      const montoTotal = parseFloat(monto_total);
      let transaccionId = null;
      try {
        const txRes = await pool.query(
          `INSERT INTO transacciones (usuario_id, tipo, fecha, monto, monto_absoluto, descripcion, cuenta_id)
           VALUES ($1, 'venta', CURRENT_DATE, $2, $2, $3, $4) RETURNING id`,
          [req.user.id, montoTotal, `Pedido #${pedido.id}: ${descripcion}`, cuenta_id || null]
        );
        transaccionId = txRes.rows[0].id;
        if (cuenta_id) {
          await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2', [montoTotal, cuenta_id]);
        }
      } catch (_) {}

      await pool.query(
        `INSERT INTO pagos_pedido (pedido_id, monto, metodo_pago, cuenta_id, tipo, transaccion_id, created_by)
         VALUES ($1, $2, $3, $4, 'adelanto', $5, $6)`,
        [pedido.id, montoTotal, metodo_pago || 'efectivo', cuenta_id || null, transaccionId, req.user.id]
      );
    }

    // Refresh pedido data (trigger may have updated monto_pagado)
    const updated = await pool.query('SELECT * FROM pedidos WHERE id = $1', [pedido.id]);

    logAudit({
      userId: req.user.id, entidad: 'pedido', entidadId: pedido.id, accion: 'crear',
      descripcion: `Creó pedido "${descripcion}" por S/${monto_total}${tipo_pago === 'contra_entrega' ? ' (contra entrega)' : ''}`
    });

    return res.status(201).json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('Create pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/pedidos/:id — update status, notes, delivery date
router.put('/:id', async (req, res) => {
  try {
    const { estado, notas, fecha_entrega_estimada } = req.body;
    const result = await pool.query(
      `UPDATE pedidos SET
        estado = COALESCE($1, estado),
        notas = COALESCE($2, notas),
        fecha_entrega_estimada = COALESCE($3, fecha_entrega_estimada),
        updated_at = NOW()
       WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [estado, notas, fecha_entrega_estimada, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    if (estado) {
      logAudit({ userId: req.user.id, entidad: 'pedido', entidadId: req.params.id, accion: 'editar',
        descripcion: `Cambió estado de pedido #${req.params.id} a "${estado}"` });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pedidos/:id/entregar — mark as delivered
router.post('/:id/entregar', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pedidos SET estado = 'entregado', fecha_entrega_real = NOW(), updated_at = NOW()
       WHERE id = $1 AND usuario_id = $2 AND estado NOT IN ('cancelado', 'pagado') RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado o ya finalizado' });

    logAudit({ userId: req.user.id, entidad: 'pedido', entidadId: req.params.id, accion: 'entregar',
      descripcion: `Marcó pedido #${req.params.id} como entregado` });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Entregar pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/pedidos/:id/pagos — register payment against order
router.post('/:id/pagos', async (req, res) => {
  try {
    const { monto, metodo_pago, cuenta_id, notas } = req.body;
    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ success: false, error: 'Monto requerido' });
    }

    const pedido = await pool.query(
      'SELECT * FROM pedidos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (pedido.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    const p = pedido.rows[0];
    const pendiente = parseFloat(p.monto_total) - parseFloat(p.monto_pagado);
    const montoP = Math.min(parseFloat(monto), pendiente); // Don't overpay

    // Determine payment type
    const tipo = montoP >= pendiente ? 'restante' : 'parcial';

    // Create transaction in cash flow
    let transaccionId = null;
    try {
      const txRes = await pool.query(
        `INSERT INTO transacciones (usuario_id, tipo, fecha, monto, monto_absoluto, descripcion, cuenta_id)
         VALUES ($1, 'venta', CURRENT_DATE, $2, $2, $3, $4) RETURNING id`,
        [req.user.id, montoP, `Pago ${tipo} pedido #${p.id}: ${p.descripcion}`, cuenta_id || null]
      );
      transaccionId = txRes.rows[0].id;
      if (cuenta_id) {
        await pool.query('UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2', [montoP, cuenta_id]);
      }
    } catch (_) {}

    const pagoRes = await pool.query(
      `INSERT INTO pagos_pedido (pedido_id, monto, metodo_pago, cuenta_id, tipo, transaccion_id, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, montoP, metodo_pago || 'efectivo', cuenta_id || null, tipo, transaccionId, notas || null, req.user.id]
    );

    // Refresh pedido
    const updated = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
    const newPendiente = parseFloat(updated.rows[0].monto_total) - parseFloat(updated.rows[0].monto_pagado);

    logAudit({ userId: req.user.id, entidad: 'pedido', entidadId: req.params.id, accion: 'pagar',
      descripcion: `Registró pago de S/${montoP.toFixed(2)} (${tipo}) — pendiente: S/${newPendiente.toFixed(2)}` });

    return res.status(201).json({
      success: true,
      data: {
        pago: pagoRes.rows[0],
        pedido: updated.rows[0],
        monto_pendiente: Math.round(newPendiente * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Pago pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/pedidos/:id — cancel order
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pedidos SET estado = 'cancelado', updated_at = NOW()
       WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    logAudit({ userId: req.user.id, entidad: 'pedido', entidadId: req.params.id, accion: 'cancelar',
      descripcion: `Canceló pedido #${req.params.id}` });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Cancel pedido error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
