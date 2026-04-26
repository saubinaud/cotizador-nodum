const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ==================== SEED DEFAULT CATEGORIES ====================

async function seedCategorias(usuarioId) {
  const existing = await pool.query('SELECT COUNT(*) FROM flujo_categorias WHERE usuario_id = $1', [usuarioId]);
  if (parseInt(existing.rows[0].count) > 0) return;

  const defaults = [
    // Ingresos operativos
    { nombre: 'Ventas en efectivo', seccion: 'operativo', tipo: 'ingreso', orden: 1 },
    { nombre: 'Ventas Yape/Plin', seccion: 'operativo', tipo: 'ingreso', orden: 2 },
    { nombre: 'Ventas transferencia', seccion: 'operativo', tipo: 'ingreso', orden: 3 },
    { nombre: 'Ventas con tarjeta', seccion: 'operativo', tipo: 'ingreso', orden: 4 },
    { nombre: 'Otros ingresos', seccion: 'operativo', tipo: 'ingreso', orden: 5 },
    // Egresos operativos
    { nombre: 'Compras de insumos', seccion: 'operativo', tipo: 'egreso', orden: 10 },
    { nombre: 'Compras de materiales/empaque', seccion: 'operativo', tipo: 'egreso', orden: 11 },
    { nombre: 'Planilla/sueldos', seccion: 'operativo', tipo: 'egreso', orden: 12 },
    { nombre: 'Alquiler', seccion: 'operativo', tipo: 'egreso', orden: 13 },
    { nombre: 'Luz', seccion: 'operativo', tipo: 'egreso', orden: 14 },
    { nombre: 'Agua', seccion: 'operativo', tipo: 'egreso', orden: 15 },
    { nombre: 'Gas', seccion: 'operativo', tipo: 'egreso', orden: 16 },
    { nombre: 'Marketing/publicidad', seccion: 'operativo', tipo: 'egreso', orden: 17 },
    { nombre: 'Delivery/transporte', seccion: 'operativo', tipo: 'egreso', orden: 18 },
    { nombre: 'Mantenimiento', seccion: 'operativo', tipo: 'egreso', orden: 19 },
    { nombre: 'Software/suscripciones', seccion: 'operativo', tipo: 'egreso', orden: 20 },
    { nombre: 'Seguros', seccion: 'operativo', tipo: 'egreso', orden: 21 },
    { nombre: 'Impuestos', seccion: 'operativo', tipo: 'egreso', orden: 22 },
    { nombre: 'Gastos bancarios', seccion: 'operativo', tipo: 'egreso', orden: 23 },
    { nombre: 'Otros gastos operativos', seccion: 'operativo', tipo: 'egreso', orden: 24 },
    // Inversión
    { nombre: 'Compra de equipos', seccion: 'inversion', tipo: 'egreso', orden: 30 },
    { nombre: 'Mejoras del local', seccion: 'inversion', tipo: 'egreso', orden: 31 },
    { nombre: 'Venta de equipos', seccion: 'inversion', tipo: 'ingreso', orden: 32 },
    // Financiamiento
    { nombre: 'Préstamos recibidos', seccion: 'financiamiento', tipo: 'ingreso', orden: 40 },
    { nombre: 'Pago de préstamos', seccion: 'financiamiento', tipo: 'egreso', orden: 41 },
    { nombre: 'Aportes de capital', seccion: 'financiamiento', tipo: 'ingreso', orden: 42 },
    { nombre: 'Retiros del dueño', seccion: 'financiamiento', tipo: 'egreso', orden: 43 },
  ];

  for (const cat of defaults) {
    await pool.query(
      'INSERT INTO flujo_categorias (usuario_id, nombre, seccion, tipo, orden, es_default) VALUES ($1, $2, $3, $4, $5, true)',
      [usuarioId, cat.nombre, cat.seccion, cat.tipo, cat.orden]
    );
  }
}

// ==================== CUENTAS (ACCOUNTS) ====================

// GET /api/flujo/cuentas
router.get('/cuentas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM flujo_cuentas WHERE usuario_id = $1 AND activa = true ORDER BY orden, nombre',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Flujo cuentas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/flujo/cuentas
router.post('/cuentas', async (req, res) => {
  try {
    const { nombre, tipo, saldo_actual } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const validTipo = ['efectivo', 'banco', 'digital'].includes(tipo) ? tipo : 'efectivo';
    const result = await pool.query(
      'INSERT INTO flujo_cuentas (usuario_id, nombre, tipo, saldo_actual) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, nombre, validTipo, parseFloat(saldo_actual) || 0]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create cuenta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/flujo/cuentas/:id
router.put('/cuentas/:id', async (req, res) => {
  try {
    const { nombre, tipo, saldo_actual, activa } = req.body;
    const result = await pool.query(
      `UPDATE flujo_cuentas SET
        nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo),
        saldo_actual = COALESCE($3::numeric, saldo_actual), activa = COALESCE($4, activa)
       WHERE id = $5 AND usuario_id = $6 RETURNING *`,
      [nombre, tipo, saldo_actual, activa, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update cuenta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/flujo/cuentas/:id
router.delete('/cuentas/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE flujo_cuentas SET activa = false WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    return res.json({ success: true, data: { message: 'Cuenta desactivada' } });
  } catch (err) {
    console.error('Delete cuenta error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== CATEGORÍAS ====================

// GET /api/flujo/categorias
router.get('/categorias', async (req, res) => {
  try {
    // Seed defaults if first time
    await seedCategorias(req.user.id);
    const result = await pool.query(
      'SELECT * FROM flujo_categorias WHERE usuario_id = $1 AND activa = true ORDER BY seccion, tipo DESC, orden',
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Flujo categorias error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/flujo/categorias
router.post('/categorias', async (req, res) => {
  try {
    const { nombre, seccion, tipo } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const validSeccion = ['operativo', 'inversion', 'financiamiento'].includes(seccion) ? seccion : 'operativo';
    const validTipo = ['ingreso', 'egreso'].includes(tipo) ? tipo : 'egreso';
    const result = await pool.query(
      'INSERT INTO flujo_categorias (usuario_id, nombre, seccion, tipo) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, nombre, validSeccion, validTipo]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create flujo categoria error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/flujo/categorias/:id — only non-defaults
router.delete('/categorias/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE flujo_categorias SET activa = false WHERE id = $1 AND usuario_id = $2 AND es_default = false RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Categoría no encontrada o es predeterminada' });
    return res.json({ success: true, data: { message: 'Categoría desactivada' } });
  } catch (err) {
    console.error('Delete flujo categoria error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== MOVIMIENTOS (CRUD for cash flow entries) ====================

// POST /api/flujo/movimientos — create a cash flow entry
router.post('/movimientos', async (req, res) => {
  try {
    const { periodo_id, flujo_categoria_id, cuenta_id, fecha, monto_absoluto, descripcion, nota } = req.body;
    if (!fecha || !monto_absoluto || !flujo_categoria_id) {
      return res.status(400).json({ success: false, error: 'fecha, monto y categoría son requeridos' });
    }

    // Look up category to determine sign and section
    const catRes = await pool.query('SELECT seccion, tipo FROM flujo_categorias WHERE id = $1 AND usuario_id = $2', [flujo_categoria_id, req.user.id]);
    if (catRes.rows.length === 0) return res.status(400).json({ success: false, error: 'Categoría no encontrada' });
    const cat = catRes.rows[0];

    const absVal = Math.abs(parseFloat(monto_absoluto));
    const monto = cat.tipo === 'ingreso' ? absVal : -absVal;

    // Map flujo section to transaccion tipo
    const tipo = cat.tipo === 'ingreso' ? 'venta' : 'gasto';

    // Auto-assign periodo if not provided
    let pid = periodo_id;
    if (!pid) {
      const per = await pool.query(
        'SELECT id FROM periodos WHERE usuario_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
        [req.user.id, fecha]
      );
      pid = per.rows[0]?.id || null;
    }

    const result = await pool.query(
      `INSERT INTO transacciones (usuario_id, periodo_id, tipo, fecha, monto, monto_absoluto, descripcion, nota, cuenta_id, flujo_categoria_id, flujo_seccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.id, pid, tipo, fecha, monto, absVal, descripcion || null, nota || null, cuenta_id || null, flujo_categoria_id, cat.seccion]
    );

    // Update account balance if linked
    if (cuenta_id) {
      await pool.query(
        'UPDATE flujo_cuentas SET saldo_actual = saldo_actual + $1 WHERE id = $2',
        [monto, cuenta_id]
      );
    }

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create flujo movimiento error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/flujo/movimientos/:id
router.delete('/movimientos/:id', async (req, res) => {
  try {
    const tx = await pool.query('SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    if (tx.rows.length === 0) return res.status(404).json({ success: false, error: 'Movimiento no encontrado' });

    // Reverse account balance
    if (tx.rows[0].cuenta_id) {
      await pool.query(
        'UPDATE flujo_cuentas SET saldo_actual = saldo_actual - $1 WHERE id = $2',
        [-Math.abs(parseFloat(tx.rows[0].monto)), tx.rows[0].cuenta_id]
      );
    }

    await pool.query('DELETE FROM transacciones WHERE id = $1', [req.params.id]);
    return res.json({ success: true, data: { message: 'Movimiento eliminado' } });
  } catch (err) {
    console.error('Delete flujo movimiento error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== GRID MENSUAL (THE MAIN VIEW) ====================

// GET /api/flujo/grid?anio=2026 — monthly grid with all sections
router.get('/grid', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    // Seed categories
    await seedCategorias(req.user.id);

    // Get all categories for this user
    const catsRes = await pool.query(
      'SELECT * FROM flujo_categorias WHERE usuario_id = $1 AND activa = true ORDER BY seccion, tipo DESC, orden',
      [req.user.id]
    );
    const categorias = catsRes.rows;

    // Get all periods for this year
    const persRes = await pool.query(
      `SELECT * FROM periodos WHERE usuario_id = $1
       AND EXTRACT(YEAR FROM fecha_inicio) = $2
       ORDER BY fecha_inicio`,
      [req.user.id, anio]
    );
    const periodos = persRes.rows;

    // For each period, get totals by flujo_categoria_id
    const meses = [];
    let saldoAnterior = 0;

    // Get saldo_inicial of first period
    if (periodos.length > 0) {
      saldoAnterior = parseFloat(periodos[0].saldo_inicial) || 0;
    }

    for (const per of periodos) {
      const saldoInicial = saldoAnterior;

      // Get all transactions for this period grouped by flujo_categoria_id
      const txRes = await pool.query(
        `SELECT flujo_categoria_id, SUM(monto) AS total, SUM(monto_absoluto) AS total_abs
         FROM transacciones
         WHERE usuario_id = $1 AND periodo_id = $2 AND flujo_categoria_id IS NOT NULL
         GROUP BY flujo_categoria_id`,
        [req.user.id, per.id]
      );

      // Also get non-classified transactions (from legacy ventas/compras/gastos)
      const legacyRes = await pool.query(
        `SELECT tipo, SUM(monto) AS total, SUM(monto_absoluto) AS total_abs
         FROM transacciones
         WHERE usuario_id = $1 AND periodo_id = $2 AND flujo_categoria_id IS NULL
         GROUP BY tipo`,
        [req.user.id, per.id]
      );

      // Build per-category totals
      const porCategoria = {};
      for (const row of txRes.rows) {
        porCategoria[row.flujo_categoria_id] = {
          total: parseFloat(row.total),
          total_abs: parseFloat(row.total_abs),
        };
      }

      // Legacy totals (unclassified)
      const legacy = {};
      for (const row of legacyRes.rows) {
        legacy[row.tipo] = { total: parseFloat(row.total), total_abs: parseFloat(row.total_abs) };
      }

      // Calculate section totals
      let totalIngresosOp = 0, totalEgresosOp = 0;
      let totalIngresosInv = 0, totalEgresosInv = 0;
      let totalIngresosFin = 0, totalEgresosFin = 0;

      for (const cat of categorias) {
        const val = porCategoria[cat.id]?.total_abs || 0;
        if (cat.seccion === 'operativo' && cat.tipo === 'ingreso') totalIngresosOp += val;
        if (cat.seccion === 'operativo' && cat.tipo === 'egreso') totalEgresosOp += val;
        if (cat.seccion === 'inversion' && cat.tipo === 'ingreso') totalIngresosInv += val;
        if (cat.seccion === 'inversion' && cat.tipo === 'egreso') totalEgresosInv += val;
        if (cat.seccion === 'financiamiento' && cat.tipo === 'ingreso') totalIngresosFin += val;
        if (cat.seccion === 'financiamiento' && cat.tipo === 'egreso') totalEgresosFin += val;
      }

      // Add legacy unclassified
      totalIngresosOp += (legacy.venta?.total_abs || 0);
      totalEgresosOp += (legacy.gasto?.total_abs || 0) + (legacy.compra?.total_abs || 0);

      const flujoOperativo = totalIngresosOp - totalEgresosOp;
      const flujoInversion = totalIngresosInv - totalEgresosInv;
      const flujoFinanciamiento = totalIngresosFin - totalEgresosFin;
      const flujoNeto = flujoOperativo + flujoInversion + flujoFinanciamiento;
      const saldoFinal = saldoInicial + flujoNeto;

      meses.push({
        periodo: per,
        saldo_inicial: Math.round(saldoInicial * 100) / 100,
        por_categoria: porCategoria,
        legacy,
        totales: {
          ingresos_operativos: Math.round(totalIngresosOp * 100) / 100,
          egresos_operativos: Math.round(totalEgresosOp * 100) / 100,
          flujo_operativo: Math.round(flujoOperativo * 100) / 100,
          ingresos_inversion: Math.round(totalIngresosInv * 100) / 100,
          egresos_inversion: Math.round(totalEgresosInv * 100) / 100,
          flujo_inversion: Math.round(flujoInversion * 100) / 100,
          ingresos_financiamiento: Math.round(totalIngresosFin * 100) / 100,
          egresos_financiamiento: Math.round(totalEgresosFin * 100) / 100,
          flujo_financiamiento: Math.round(flujoFinanciamiento * 100) / 100,
          flujo_neto: Math.round(flujoNeto * 100) / 100,
        },
        saldo_final: Math.round(saldoFinal * 100) / 100,
      });

      saldoAnterior = saldoFinal;
    }

    return res.json({
      success: true,
      data: {
        anio,
        categorias,
        meses,
      },
    });
  } catch (err) {
    console.error('Flujo grid error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ==================== ARQUEO DE CAJA ====================

// GET /api/flujo/arqueo?periodo_id=X
router.get('/arqueo', async (req, res) => {
  try {
    const { periodo_id } = req.query;
    if (!periodo_id) return res.status(400).json({ success: false, error: 'periodo_id requerido' });

    const arqueo = await pool.query(
      'SELECT * FROM flujo_arqueos WHERE periodo_id = $1 AND usuario_id = $2 ORDER BY created_at DESC LIMIT 1',
      [periodo_id, req.user.id]
    );

    const cuentas = await pool.query(
      'SELECT * FROM flujo_cuentas WHERE usuario_id = $1 AND activa = true ORDER BY orden, nombre',
      [req.user.id]
    );

    let detalles = [];
    if (arqueo.rows.length > 0) {
      const detRes = await pool.query(
        `SELECT ad.*, fc.nombre AS cuenta_nombre, fc.tipo AS cuenta_tipo
         FROM flujo_arqueo_detalles ad
         JOIN flujo_cuentas fc ON fc.id = ad.cuenta_id
         WHERE ad.arqueo_id = $1`,
        [arqueo.rows[0].id]
      );
      detalles = detRes.rows;
    }

    return res.json({
      success: true,
      data: {
        arqueo: arqueo.rows[0] || null,
        detalles,
        cuentas: cuentas.rows,
      },
    });
  } catch (err) {
    console.error('Flujo arqueo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/flujo/arqueo — create/update arqueo
router.post('/arqueo', async (req, res) => {
  try {
    const { periodo_id, detalles, observaciones, cerrar } = req.body;
    if (!periodo_id || !detalles) return res.status(400).json({ success: false, error: 'periodo_id y detalles requeridos' });

    // Calculate totals
    let saldoSistema = 0, saldoReal = 0;
    for (const d of detalles) {
      saldoSistema += parseFloat(d.saldo_sistema) || 0;
      saldoReal += parseFloat(d.saldo_real) || 0;
    }
    const diferencia = saldoReal - saldoSistema;

    // Delete existing arqueo for this period (replace)
    const existingArqueo = await pool.query(
      'SELECT id FROM flujo_arqueos WHERE periodo_id = $1 AND usuario_id = $2',
      [periodo_id, req.user.id]
    );
    if (existingArqueo.rows.length > 0) {
      await pool.query('DELETE FROM flujo_arqueo_detalles WHERE arqueo_id = $1', [existingArqueo.rows[0].id]);
      await pool.query('DELETE FROM flujo_arqueos WHERE id = $1', [existingArqueo.rows[0].id]);
    }

    // Create new arqueo
    const arqueoRes = await pool.query(
      `INSERT INTO flujo_arqueos (usuario_id, periodo_id, fecha, saldo_sistema, saldo_real, diferencia, observaciones, cerrado)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, periodo_id, saldoSistema, saldoReal, diferencia, observaciones || null, cerrar || false]
    );
    const arqueoId = arqueoRes.rows[0].id;

    // Insert details
    for (const d of detalles) {
      const sS = parseFloat(d.saldo_sistema) || 0;
      const sR = parseFloat(d.saldo_real) || 0;
      await pool.query(
        'INSERT INTO flujo_arqueo_detalles (arqueo_id, cuenta_id, saldo_sistema, saldo_real, diferencia) VALUES ($1, $2, $3, $4, $5)',
        [arqueoId, d.cuenta_id, sS, sR, sR - sS]
      );
    }

    // If closing: update account balances to real values and set next period's saldo_inicial
    if (cerrar) {
      for (const d of detalles) {
        await pool.query('UPDATE flujo_cuentas SET saldo_actual = $1 WHERE id = $2', [parseFloat(d.saldo_real) || 0, d.cuenta_id]);
      }

      // Set next period's saldo_inicial
      const currentPer = await pool.query('SELECT fecha_fin FROM periodos WHERE id = $1', [periodo_id]);
      if (currentPer.rows.length > 0) {
        await pool.query(
          `UPDATE periodos SET saldo_inicial = $1 WHERE id = (
            SELECT id FROM periodos WHERE usuario_id = $2 AND fecha_inicio > $3 ORDER BY fecha_inicio LIMIT 1
          )`,
          [saldoReal, req.user.id, currentPer.rows[0].fecha_fin]
        );
      }
    }

    return res.status(201).json({ success: true, data: arqueoRes.rows[0] });
  } catch (err) {
    console.error('Create arqueo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
