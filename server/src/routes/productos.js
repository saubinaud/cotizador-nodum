const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { calcularCostos, round4 } = require('../services/calculador');
const { aBase, calcCostoLinea } = require('../utils/unidades');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.use(auth);

// POST /api/productos
router.post('/', async (req, res) => {
  // Trial limit check
  const planCheck = await pool.query('SELECT plan, trial_ends_at, max_productos FROM usuarios WHERE id = $1', [req.user.id]);
  const userPlan = planCheck.rows[0];
  if (userPlan?.plan === 'trial') {
    const countRes = await pool.query('SELECT COUNT(*) FROM productos WHERE usuario_id = $1', [req.user.id]);
    const currentCount = parseInt(countRes.rows[0].count);
    const maxAllowed = parseInt(userPlan.max_productos) || 2;
    if (currentCount >= maxAllowed) {
      return res.status(403).json({
        success: false,
        error: `Tu plan de prueba permite máximo ${maxAllowed} productos. Actualiza a Pro para crear más.`,
        code: 'TRIAL_LIMIT'
      });
    }
  }

  const client = await pool.connect();
  try {
    const { nombre, margen, margen_porcion, preparaciones, materiales, imagen_url, tipo_presentacion, unidades_por_producto } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    const igv_rate = req.user.igv_rate || 0.18;
    const margenDecimal = parseFloat(margen) > 1 ? parseFloat(margen) / 100 : parseFloat(margen) || 0;
    const margenPorcionDecimal = margen_porcion != null ? (parseFloat(margen_porcion) > 1 ? parseFloat(margen_porcion) / 100 : parseFloat(margen_porcion) || 0) : null;

    await client.query('BEGIN');

    const prodRes = await client.query(
      `INSERT INTO productos (usuario_id, nombre, margen, margen_porcion, igv_rate, imagen_url, tipo_presentacion, unidades_por_producto, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.id, nombre, margenDecimal, margenPorcionDecimal, igv_rate, imagen_url || null, tipo_presentacion || 'unidad', parseInt(unidades_por_producto) || 1, req.user.id]
    );
    const producto = prodRes.rows[0];

    let allInsumos = [];
    if (preparaciones && preparaciones.length > 0) {
      for (const prep of preparaciones) {
        const prepRes = await client.query(
          `INSERT INTO producto_preparaciones (producto_id, nombre, orden, capacidad, unidad_capacidad, cantidad_por_unidad)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [producto.id, prep.nombre, prep.orden || 0, prep.capacidad || null, prep.unidad || null, prep.cantidad_por_unidad || null]
        );
        const prepId = prepRes.rows[0].id;

        if (prep.insumos && prep.insumos.length > 0) {
          for (const ins of prep.insumos) {
            const insumoData = await client.query(
              'SELECT precio_presentacion, cantidad_presentacion, unidad_medida, costo_base FROM insumos WHERE id = $1',
              [ins.insumo_id]
            );
            const iData = insumoData.rows[0];
            if (!iData) continue;

            const cant = parseFloat(ins.cantidad_usada || ins.cantidad);
            const usoU = ins.uso_unidad || iData.unidad_medida;
            const cantBase = round4(aBase(cant, usoU));
            const costoBase = parseFloat(iData.costo_base) || (parseFloat(iData.precio_presentacion) / aBase(parseFloat(iData.cantidad_presentacion), iData.unidad_medida));
            const costoLinea = round4(cantBase * costoBase);

            await client.query(
              `INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad, uso_unidad, cantidad_base, costo_linea)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [prepId, ins.insumo_id, cant, usoU, cantBase, costoLinea]
            );

            allInsumos.push({
              precio_presentacion: parseFloat(iData.precio_presentacion),
              cantidad_presentacion: parseFloat(iData.cantidad_presentacion),
              unidad_medida: iData.unidad_medida,
              uso_unidad: usoU,
              cantidad_usada: cant,
            });
          }
        }
      }
    }

    let costo_empaque = 0;
    if (materiales && materiales.length > 0) {
      for (const mat of materiales) {
        await client.query(
          `INSERT INTO producto_materiales (producto_id, material_id, cantidad, empaque_tipo)
           VALUES ($1, $2, $3, $4)`,
          [producto.id, mat.material_id, mat.cantidad, mat.empaque_tipo || 'entero']
        );

        const matData = await client.query(
          'SELECT precio_presentacion, cantidad_presentacion FROM materiales WHERE id = $1',
          [mat.material_id]
        );
        if (matData.rows.length > 0) {
          const cu = round4(parseFloat(matData.rows[0].precio_presentacion) / parseFloat(matData.rows[0].cantidad_presentacion));
          costo_empaque += round4(parseFloat(mat.cantidad) * cu);
        }
      }
    }

    // Use pre-calculated costs from frontend (includes porciones logic)
    const costos = {
      costo_insumos: round4(parseFloat(req.body.costoInsumos || req.body.costoInsumosProducto) || 0),
      costo_empaque: round4(parseFloat(req.body.costoEmpaque || req.body.costoEmpaqueEntero) || costo_empaque),
      costo_neto: round4(parseFloat(req.body.costoNeto) || 0),
      precio_venta: round4(parseFloat(req.body.precioVenta) || 0),
      precio_final: round4(parseFloat(req.body.precioFinal) || 0),
    };

    // Fallback: if frontend didn't send costs, calculate from costo_linea sum
    if (!costos.costo_neto) {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(ppi.costo_linea), 0) as total FROM producto_prep_insumos ppi JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id WHERE pp.producto_id = $1`,
        [producto.id]
      );
      costos.costo_insumos = round4(parseFloat(sumRes.rows[0].total));
      costos.costo_neto = round4(costos.costo_insumos + costos.costo_empaque);
      costos.precio_venta = margenDecimal < 1 ? round4(costos.costo_neto / (1 - margenDecimal)) : costos.costo_neto;
      costos.precio_final = round4(costos.precio_venta * (1 + igv_rate));
    }

    await client.query(
      `UPDATE productos SET
        costo_insumos = $1, costo_empaque = $2, costo_neto = $3,
        precio_venta = $4, precio_final = $5
       WHERE id = $6`,
      [costos.costo_insumos, costos.costo_empaque, costos.costo_neto, costos.precio_venta, costos.precio_final, producto.id]
    );

    await client.query(
      `INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [producto.id, JSON.stringify({ ...producto, ...costos }), 'Creacion inicial', costos.costo_neto, costos.precio_final]
    );

    // If producto entero, auto-create unit version
    let productoUnidad = null;
    if (tipo_presentacion === 'entero' && parseInt(unidades_por_producto) > 1) {
      const uniPorciones = parseInt(unidades_por_producto);
      const costoPorcion = round4(costos.costo_insumos / uniPorciones);
      const empaqueUnidad = round4(parseFloat(req.body.costoEmpaqueUnidad) || 0);
      const costoNetoPorcion = round4(costoPorcion + empaqueUnidad);
      const margenPorcionVal = req.body.margen_porcion != null
        ? (parseFloat(req.body.margen_porcion) > 1 ? parseFloat(req.body.margen_porcion) / 100 : parseFloat(req.body.margen_porcion))
        : margenDecimal;
      const precioVentaPorcion = margenPorcionVal < 1 ? round4(costoNetoPorcion / (1 - margenPorcionVal)) : costoNetoPorcion;
      const precioFinalPorcion = round4(precioVentaPorcion * (1 + igv_rate));

      const uniRes = await client.query(
        `INSERT INTO productos (usuario_id, nombre, margen, margen_porcion, igv_rate, imagen_url, tipo_presentacion, unidades_por_producto, producto_padre_id,
          costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final)
         VALUES ($1, $2, $3, $4, $5, $6, 'unidad', 1, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [req.user.id, nombre + ' (porcion)', margenPorcionVal, null, igv_rate, imagen_url || null, producto.id,
          costoPorcion, empaqueUnidad, costoNetoPorcion, precioVentaPorcion, precioFinalPorcion]
      );
      productoUnidad = uniRes.rows[0];
    }

    await client.query('COMMIT');

    logAudit({ userId: req.user.id, entidad: 'producto', entidadId: producto.id, accion: 'crear', descripcion: `Creo producto "${nombre}"` });

    return res.status(201).json({ success: true, data: { ...producto, ...costos, productoUnidad } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create product error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, margen, igv_rate,
              costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final,
              imagen_url, tipo_presentacion, unidades_por_producto, margen_porcion, producto_padre_id, created_at, updated_at
       FROM productos
       WHERE usuario_id = $1
       ORDER BY nombre ASC`,
      [req.user.id]
    );
    let productos = result.rows;

    // Trial limit: only first 2 products (by created_at ASC)
    if (req.user.plan === 'trial') {
      const userRes = await pool.query('SELECT plan, trial_ends_at, max_productos FROM usuarios WHERE id = $1', [req.user.id]);
      const u = userRes.rows[0];
      if (u && u.plan === 'trial') {
        const max = parseInt(u.max_productos) || 2;
        productos = result.rows.slice(0, max).map(p => ({ ...p, locked: false }));
        const locked = result.rows.slice(max).map(p => ({ ...p, locked: true }));
        productos = [...productos, ...locked];
      }
    }

    return res.json({ success: true, data: productos });
  } catch (err) {
    console.error('List products error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/productos/catalogs — returns all catalog data in one request
router.get('/catalogs', async (req, res) => {
  try {
    const [insumos, materiales, prepsPred, empaquesPred] = await Promise.all([
      pool.query('SELECT * FROM insumos WHERE usuario_id = $1 ORDER BY nombre', [req.user.id]),
      pool.query('SELECT * FROM materiales WHERE usuario_id = $1 ORDER BY nombre', [req.user.id]),
      (async () => {
        const preps = await pool.query('SELECT * FROM preparaciones_predeterminadas WHERE usuario_id = $1 ORDER BY nombre', [req.user.id]);
        const result = [];
        for (const prep of preps.rows) {
          const ins = await pool.query(
            `SELECT ppi.id, ppi.insumo_id, ppi.cantidad, ppi.uso_unidad,
                    i.nombre, i.unidad_medida, i.precio_presentacion, i.cantidad_presentacion
             FROM prep_pred_insumos ppi JOIN insumos i ON i.id = ppi.insumo_id
             WHERE ppi.preparacion_pred_id = $1`, [prep.id]
          );
          result.push({ ...prep, insumos: ins.rows });
        }
        return result;
      })(),
      (async () => {
        const emps = await pool.query('SELECT * FROM empaques_predeterminados WHERE usuario_id = $1 ORDER BY nombre', [req.user.id]);
        const result = [];
        for (const emp of emps.rows) {
          const mats = await pool.query(
            `SELECT epm.id, epm.material_id, epm.cantidad,
                    m.nombre, m.unidad_medida, m.precio_presentacion, m.cantidad_presentacion
             FROM empaque_pred_materiales epm JOIN materiales m ON m.id = epm.material_id
             WHERE epm.empaque_pred_id = $1`, [emp.id]
          );
          result.push({ ...emp, materiales: mats.rows });
        }
        return result;
      })(),
    ]);

    return res.json({
      success: true,
      data: {
        insumos: insumos.rows,
        materiales: materiales.rows,
        preparaciones_pred: prepsPred,
        empaques_pred: empaquesPred,
      }
    });
  } catch (err) {
    console.error('Catalogs error:', err);
    return res.status(500).json({ success: false, error: 'Error cargando catalogos' });
  }
});

// GET /api/productos/:id
router.get('/:id', async (req, res) => {
  try {
    const prodRes = await pool.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    const producto = prodRes.rows[0];

    const prepsRes = await pool.query(
      'SELECT * FROM producto_preparaciones WHERE producto_id = $1 ORDER BY orden ASC',
      [producto.id]
    );

    const preparaciones = [];
    for (const prep of prepsRes.rows) {
      const insRes = await pool.query(
        `SELECT ppi.id, ppi.insumo_id, ppi.cantidad AS cantidad_usada, ppi.uso_unidad, ppi.cantidad_base, ppi.costo_linea,
                i.nombre, i.unidad_medida, i.precio_presentacion, i.cantidad_presentacion
         FROM producto_prep_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         WHERE ppi.producto_preparacion_id = $1`,
        [prep.id]
      );
      preparaciones.push({ ...prep, insumos: insRes.rows });
    }

    const matsRes = await pool.query(
      `SELECT pm.id, pm.material_id, pm.cantidad, pm.empaque_tipo,
              m.nombre, m.unidad_medida, m.precio_presentacion, m.cantidad_presentacion
       FROM producto_materiales pm
       JOIN materiales m ON m.id = pm.material_id
       WHERE pm.producto_id = $1`,
      [producto.id]
    );

    return res.json({
      success: true,
      data: { ...producto, preparaciones, materiales: matsRes.rows },
    });
  } catch (err) {
    console.error('Get product detail error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/productos/:id
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, margen, margen_porcion, preparaciones, materiales, imagen_url, tipo_presentacion, unidades_por_producto } = req.body;

    const existing = await client.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const igv_rate = req.user.igv_rate || 0.18;
    const margenDecimal = margen !== undefined
      ? (parseFloat(margen) > 1 ? parseFloat(margen) / 100 : parseFloat(margen) || 0)
      : undefined;
    const margenPorcionDecimal = margen_porcion != null
      ? (parseFloat(margen_porcion) > 1 ? parseFloat(margen_porcion) / 100 : parseFloat(margen_porcion) || 0)
      : undefined;

    await client.query('BEGIN');

    await client.query(
      `UPDATE productos SET
        nombre = COALESCE($1, nombre),
        margen = COALESCE($2, margen),
        margen_porcion = $8,
        igv_rate = $3,
        imagen_url = COALESCE($5, imagen_url),
        tipo_presentacion = COALESCE($6, tipo_presentacion),
        unidades_por_producto = COALESCE($7, unidades_por_producto),
        updated_by = $9,
        updated_at = NOW()
       WHERE id = $4`,
      [nombre, margenDecimal, igv_rate, req.params.id, imagen_url, tipo_presentacion, unidades_por_producto ? parseInt(unidades_por_producto) : undefined, margenPorcionDecimal, req.user.id]
    );

    let allInsumos = [];
    if (preparaciones !== undefined) {
      const oldPreps = await client.query(
        'SELECT id FROM producto_preparaciones WHERE producto_id = $1',
        [req.params.id]
      );
      for (const op of oldPreps.rows) {
        await client.query('DELETE FROM producto_prep_insumos WHERE producto_preparacion_id = $1', [op.id]);
      }
      await client.query('DELETE FROM producto_preparaciones WHERE producto_id = $1', [req.params.id]);

      if (preparaciones && preparaciones.length > 0) {
        for (const prep of preparaciones) {
          const prepRes = await client.query(
            'INSERT INTO producto_preparaciones (producto_id, nombre, orden, capacidad, unidad_capacidad, cantidad_por_unidad) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [req.params.id, prep.nombre, prep.orden || 0, prep.capacidad || null, prep.unidad || null, prep.cantidad_por_unidad || null]
          );
          const prepId = prepRes.rows[0].id;

          if (prep.insumos && prep.insumos.length > 0) {
            for (const ins of prep.insumos) {
              const insumoData = await client.query(
                'SELECT precio_presentacion, cantidad_presentacion, unidad_medida, costo_base FROM insumos WHERE id = $1',
                [ins.insumo_id]
              );
              const iData = insumoData.rows[0];
              if (!iData) continue;

              const cant = parseFloat(ins.cantidad_usada || ins.cantidad);
              const usoU = ins.uso_unidad || iData.unidad_medida;
              const cantBase = round4(aBase(cant, usoU));
              const costoBase = parseFloat(iData.costo_base) || (parseFloat(iData.precio_presentacion) / aBase(parseFloat(iData.cantidad_presentacion), iData.unidad_medida));
              const costoLinea = round4(cantBase * costoBase);

              await client.query(
                'INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad, uso_unidad, cantidad_base, costo_linea) VALUES ($1, $2, $3, $4, $5, $6)',
                [prepId, ins.insumo_id, cant, usoU, cantBase, costoLinea]
              );

              allInsumos.push({
                precio_presentacion: parseFloat(iData.precio_presentacion),
                cantidad_presentacion: parseFloat(iData.cantidad_presentacion),
                unidad_medida: iData.unidad_medida,
                uso_unidad: usoU,
                cantidad_usada: cant,
              });
            }
          }
        }
      }
    } else {
      const insumosRes = await client.query(
        `SELECT ppi.cantidad AS cantidad_usada, ppi.uso_unidad, i.precio_presentacion, i.cantidad_presentacion, i.unidad_medida
         FROM producto_prep_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id
         WHERE pp.producto_id = $1`,
        [req.params.id]
      );
      allInsumos = insumosRes.rows.map((r) => ({
        precio_presentacion: parseFloat(r.precio_presentacion),
        cantidad_presentacion: parseFloat(r.cantidad_presentacion),
        unidad_medida: r.unidad_medida,
        uso_unidad: r.uso_unidad || r.unidad_medida,
        cantidad_usada: parseFloat(r.cantidad_usada),
      }));
    }

    let costo_empaque = 0;
    if (materiales !== undefined) {
      await client.query('DELETE FROM producto_materiales WHERE producto_id = $1', [req.params.id]);

      if (materiales && materiales.length > 0) {
        for (const mat of materiales) {
          await client.query(
            'INSERT INTO producto_materiales (producto_id, material_id, cantidad, empaque_tipo) VALUES ($1, $2, $3, $4)',
            [req.params.id, mat.material_id, mat.cantidad, mat.empaque_tipo || 'entero']
          );

          const matData = await client.query(
            'SELECT precio_presentacion, cantidad_presentacion FROM materiales WHERE id = $1',
            [mat.material_id]
          );
          if (matData.rows.length > 0) {
            const cu = round4(parseFloat(matData.rows[0].precio_presentacion) / parseFloat(matData.rows[0].cantidad_presentacion));
            costo_empaque += round4(parseFloat(mat.cantidad) * cu);
          }
        }
      }
    } else {
      const matsRes = await client.query(
        `SELECT pm.cantidad, m.precio_presentacion, m.cantidad_presentacion
         FROM producto_materiales pm
         JOIN materiales m ON m.id = pm.material_id
         WHERE pm.producto_id = $1`,
        [req.params.id]
      );
      for (const mat of matsRes.rows) {
        const cu = round4(parseFloat(mat.precio_presentacion) / parseFloat(mat.cantidad_presentacion));
        costo_empaque += round4(parseFloat(mat.cantidad) * cu);
      }
    }

    const effectiveMargen = margenDecimal !== undefined ? margenDecimal : parseFloat(existing.rows[0].margen) || 0;

    // Use pre-calculated costs from frontend (includes porciones logic)
    const costos = {
      costo_insumos: round4(parseFloat(req.body.costoInsumos || req.body.costoInsumosProducto) || 0),
      costo_empaque: round4(parseFloat(req.body.costoEmpaque || req.body.costoEmpaqueEntero) || costo_empaque),
      costo_neto: round4(parseFloat(req.body.costoNeto) || 0),
      precio_venta: round4(parseFloat(req.body.precioVenta) || 0),
      precio_final: round4(parseFloat(req.body.precioFinal) || 0),
    };

    if (!costos.costo_neto) {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(ppi.costo_linea), 0) as total FROM producto_prep_insumos ppi JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id WHERE pp.producto_id = $1`,
        [req.params.id]
      );
      costos.costo_insumos = round4(parseFloat(sumRes.rows[0].total));
      costos.costo_neto = round4(costos.costo_insumos + costos.costo_empaque);
      costos.precio_venta = effectiveMargen < 1 ? round4(costos.costo_neto / (1 - effectiveMargen)) : costos.costo_neto;
      costos.precio_final = round4(costos.precio_venta * (1 + igv_rate));
    }

    await client.query(
      `UPDATE productos SET
        costo_insumos = $1, costo_empaque = $2, costo_neto = $3,
        precio_venta = $4, precio_final = $5
       WHERE id = $6`,
      [costos.costo_insumos, costos.costo_empaque, costos.costo_neto, costos.precio_venta, costos.precio_final, req.params.id]
    );

    const versionRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM producto_versiones WHERE producto_id = $1',
      [req.params.id]
    );

    const updatedProd = await client.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);

    await client.query(
      'INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.params.id, versionRes.rows[0].next, JSON.stringify(updatedProd.rows[0]), 'Edicion de producto', costos.costo_neto, costos.precio_final]
    );

    // Auto-update or create child unit product
    if (tipo_presentacion === 'entero' && parseInt(unidades_por_producto) > 1) {
      const uniPorciones = parseInt(unidades_por_producto);
      const costoPorcion = round4(costos.costo_insumos / uniPorciones);
      const empaqueUnidad = round4(parseFloat(req.body.costoEmpaqueUnidad) || 0);
      const costoNetoPorcion = round4(costoPorcion + empaqueUnidad);
      const margenPorcionVal = margen_porcion != null
        ? (parseFloat(margen_porcion) > 1 ? parseFloat(margen_porcion) / 100 : parseFloat(margen_porcion))
        : effectiveMargen;
      const pvPorcion = margenPorcionVal < 1 ? round4(costoNetoPorcion / (1 - margenPorcionVal)) : costoNetoPorcion;
      const pfPorcion = round4(pvPorcion * (1 + igv_rate));

      const existingChild = await client.query('SELECT id FROM productos WHERE producto_padre_id = $1', [req.params.id]);
      if (existingChild.rows.length > 0) {
        await client.query(
          `UPDATE productos SET nombre = $1, margen = $2, igv_rate = $3, imagen_url = $4,
            costo_insumos = $5, costo_empaque = $6, costo_neto = $7, precio_venta = $8, precio_final = $9, updated_at = NOW()
           WHERE id = $10`,
          [nombre + ' (porcion)', margenPorcionVal, igv_rate, imagen_url, costoPorcion, empaqueUnidad, costoNetoPorcion, pvPorcion, pfPorcion, existingChild.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO productos (usuario_id, nombre, margen, igv_rate, imagen_url, tipo_presentacion, unidades_por_producto, producto_padre_id,
            costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final)
           VALUES ($1, $2, $3, $4, $5, 'unidad', 1, $6, $7, $8, $9, $10, $11)`,
          [req.user.id, nombre + ' (porcion)', margenPorcionVal, igv_rate, imagen_url, req.params.id, costoPorcion, empaqueUnidad, costoNetoPorcion, pvPorcion, pfPorcion]
        );
      }
    }

    await client.query('COMMIT');

    logAudit({ userId: req.user.id, entidad: 'producto', entidadId: req.params.id, accion: 'editar', descripcion: `Edito producto "${nombre}"` });

    return res.json({ success: true, data: { ...updatedProd.rows[0], ...costos } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update product error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/productos/:id/ficha-tecnica — complete technical sheet data
router.get('/:id/ficha-tecnica', async (req, res) => {
  try {
    // 1. Get product with all fields
    const prodRes = await pool.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    const producto = prodRes.rows[0];

    // 2. Get user settings for defaults
    const userRes = await pool.query(
      'SELECT tarifa_mo_global, margen_minimo_global FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    const userSettings = userRes.rows[0];

    // 3. Get preparations with insumos (including merma_pct)
    const prepsRes = await pool.query(
      'SELECT * FROM producto_preparaciones WHERE producto_id = $1 ORDER BY orden ASC',
      [producto.id]
    );

    const preparaciones = [];
    let totalInsumosConMerma = 0;
    let totalMermaPrep = 0;

    for (const prep of prepsRes.rows) {
      const insRes = await pool.query(
        `SELECT ppi.id, ppi.insumo_id, ppi.cantidad, ppi.uso_unidad, ppi.cantidad_base, ppi.costo_linea,
                i.nombre, i.unidad_medida, i.precio_presentacion, i.cantidad_presentacion, i.costo_base, i.merma_pct
         FROM producto_prep_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         WHERE ppi.producto_preparacion_id = $1`,
        [prep.id]
      );

      // Get prep predeterminada merma_pct if linked
      let prepMermaPct = 0;
      if (prep.nombre) {
        const predRes = await pool.query(
          'SELECT merma_pct FROM preparaciones_predeterminadas WHERE usuario_id = $1 AND nombre = $2 LIMIT 1',
          [req.user.id, prep.nombre]
        );
        if (predRes.rows.length > 0) {
          prepMermaPct = parseFloat(predRes.rows[0].merma_pct) || 0;
        }
      }

      // Calculate costs per insumo with merma
      const insumosEnriquecidos = insRes.rows.map(ins => {
        const cantNeta = parseFloat(ins.cantidad) || 0;
        const mermaPct = parseFloat(ins.merma_pct) || 0;
        const cantBruta = mermaPct > 0 ? cantNeta / (1 - mermaPct / 100) : cantNeta;
        const costoBase = parseFloat(ins.costo_base) || 0;
        const costoUnitario = parseFloat(ins.costo_linea) / (parseFloat(ins.cantidad_base) || 1);
        const subtotalSinMerma = parseFloat(ins.costo_linea) || 0;
        const subtotalConMerma = cantBruta * costoBase;

        return {
          ...ins,
          cant_neta: cantNeta,
          merma_pct: mermaPct,
          cant_bruta: Math.round(cantBruta * 10000) / 10000,
          costo_unitario: costoUnitario,
          subtotal_sin_merma: subtotalSinMerma,
          subtotal_con_merma: Math.round(subtotalConMerma * 10000) / 10000,
        };
      });

      const costoTandaConMerma = insumosEnriquecidos.reduce((s, i) => s + i.subtotal_con_merma, 0);
      const rendimiento = parseFloat(prep.capacidad) || 0;
      const cantPorUnidad = parseFloat(prep.cantidad_por_unidad) || 0;
      const costoPorcion = rendimiento > 0 && cantPorUnidad > 0
        ? (costoTandaConMerma / rendimiento) * cantPorUnidad
        : costoTandaConMerma;

      const costoPorcionConMermaPrep = prepMermaPct > 0
        ? costoPorcion * (1 + prepMermaPct / 100)
        : costoPorcion;

      const costoMermaPrep = costoPorcionConMermaPrep - costoPorcion;

      totalInsumosConMerma += costoPorcionConMermaPrep;
      totalMermaPrep += costoMermaPrep;

      preparaciones.push({
        ...prep,
        merma_pct: prepMermaPct,
        insumos: insumosEnriquecidos,
        costo_tanda: costoTandaConMerma,
        costo_porcion: Math.round(costoPorcion * 10000) / 10000,
        costo_porcion_con_merma: Math.round(costoPorcionConMermaPrep * 10000) / 10000,
        costo_merma_prep: Math.round(costoMermaPrep * 10000) / 10000,
      });
    }

    // 4. Get materiales (empaque)
    const matsRes = await pool.query(
      `SELECT pm.id, pm.material_id, pm.cantidad, pm.empaque_tipo,
              m.nombre, m.unidad_medida, m.precio_presentacion, m.cantidad_presentacion
       FROM producto_materiales pm
       JOIN materiales m ON m.id = pm.material_id
       WHERE pm.producto_id = $1`,
      [producto.id]
    );
    const costoEmpaque = matsRes.rows.reduce((s, mat) => {
      const cu = parseFloat(mat.precio_presentacion) / parseFloat(mat.cantidad_presentacion);
      return s + parseFloat(mat.cantidad) * cu;
    }, 0);

    // 5. Calculate costs
    const unidades = producto.tipo_presentacion === 'entero' ? (parseInt(producto.unidades_por_producto) || 1) : 1;
    const foodCost = totalInsumosConMerma + costoEmpaque;

    const tarifaMo = parseFloat(producto.tarifa_mo_override) || parseFloat(userSettings.tarifa_mo_global) || 0;
    const tiempoActivo = parseInt(producto.tiempo_activo_min) || 0;
    const costoMoTanda = (tiempoActivo / 60) * tarifaMo;
    const costoMoUnitario = unidades > 0 ? costoMoTanda / unidades : 0;

    const cifGas = parseFloat(producto.cif_gas_unitario) || 0;
    const cifOverhead = parseFloat(producto.cif_overhead_unitario) || 0;
    const cifUnitario = cifGas + cifOverhead;

    const costoNeto = foodCost + costoMoUnitario + cifUnitario;

    const margenMinimo = parseFloat(producto.margen_minimo_override) || parseFloat(userSettings.margen_minimo_global) || 33;
    const precioMinimo = margenMinimo < 100 ? costoNeto / (1 - margenMinimo / 100) : costoNeto;

    const precioVenta = parseFloat(producto.precio_venta) || 0;
    const margenReal = precioVenta > 0 ? ((precioVenta - costoNeto) / precioVenta) * 100 : 0;

    // Cost breakdown percentages
    const totalCosto = costoNeto || 1;
    const pctFood = (foodCost / totalCosto) * 100;
    const pctMo = (costoMoUnitario / totalCosto) * 100;
    const pctCif = (cifUnitario / totalCosto) * 100;

    return res.json({
      success: true,
      data: {
        producto,
        preparaciones,
        materiales: matsRes.rows,
        user_settings: userSettings,
        calculos: {
          food_cost: Math.round(foodCost * 100) / 100,
          total_merma_prep: Math.round(totalMermaPrep * 100) / 100,
          costo_empaque: Math.round(costoEmpaque * 100) / 100,
          tarifa_mo: tarifaMo,
          tiempo_activo: tiempoActivo,
          costo_mo_tanda: Math.round(costoMoTanda * 100) / 100,
          costo_mo_unitario: Math.round(costoMoUnitario * 100) / 100,
          cif_gas: cifGas,
          cif_overhead: cifOverhead,
          cif_unitario: cifUnitario,
          costo_neto: Math.round(costoNeto * 100) / 100,
          margen_minimo: margenMinimo,
          precio_minimo: Math.round(precioMinimo * 100) / 100,
          precio_venta: precioVenta,
          margen_real: Math.round(margenReal * 10) / 10,
          pct_food: Math.round(pctFood * 10) / 10,
          pct_mo: Math.round(pctMo * 10) / 10,
          pct_cif: Math.round(pctCif * 10) / 10,
        },
      },
    });
  } catch (err) {
    console.error('Ficha tecnica error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// PUT /api/productos/:id/ficha-tecnica — update editable fields
router.put('/:id/ficha-tecnica', async (req, res) => {
  try {
    const { tiempo_activo_min, tiempo_horno_min, tarifa_mo_override, margen_minimo_override,
            cif_gas_unitario, cif_overhead_unitario, instrucciones_ensamble, instrucciones_prep } = req.body;

    const existing = await pool.query(
      'SELECT id FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    await pool.query(
      `UPDATE productos SET
        tiempo_activo_min = COALESCE($1, tiempo_activo_min),
        tiempo_horno_min = COALESCE($2, tiempo_horno_min),
        tarifa_mo_override = $3,
        margen_minimo_override = $4,
        cif_gas_unitario = $5,
        cif_overhead_unitario = $6,
        instrucciones_ensamble = $7,
        updated_at = NOW()
       WHERE id = $8`,
      [
        tiempo_activo_min != null ? parseInt(tiempo_activo_min) : null,
        tiempo_horno_min != null ? parseInt(tiempo_horno_min) : null,
        tarifa_mo_override != null ? parseFloat(tarifa_mo_override) : null,
        margen_minimo_override != null ? parseFloat(margen_minimo_override) : null,
        cif_gas_unitario != null ? parseFloat(cif_gas_unitario) : null,
        cif_overhead_unitario != null ? parseFloat(cif_overhead_unitario) : null,
        instrucciones_ensamble || null,
        req.params.id
      ]
    );

    // Update prep instructions if provided
    if (instrucciones_prep && Array.isArray(instrucciones_prep)) {
      for (const ip of instrucciones_prep) {
        if (ip.prep_id && ip.instrucciones !== undefined) {
          await pool.query(
            'UPDATE producto_preparaciones SET instrucciones = $1 WHERE id = $2 AND producto_id = $3',
            [ip.instrucciones || null, ip.prep_id, req.params.id]
          );
        }
      }
    }

    return res.json({ success: true, data: { message: 'Ficha actualizada' } });
  } catch (err) {
    console.error('Update ficha error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// DELETE /api/productos/:id
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    await client.query('BEGIN');

    const preps = await client.query('SELECT id FROM producto_preparaciones WHERE producto_id = $1', [req.params.id]);
    for (const p of preps.rows) {
      await client.query('DELETE FROM producto_prep_insumos WHERE producto_preparacion_id = $1', [p.id]);
    }
    await client.query('DELETE FROM producto_preparaciones WHERE producto_id = $1', [req.params.id]);
    await client.query('DELETE FROM producto_materiales WHERE producto_id = $1', [req.params.id]);
    await client.query('DELETE FROM producto_versiones WHERE producto_id = $1', [req.params.id]);
    await client.query('DELETE FROM productos WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    logAudit({ userId: req.user.id, entidad: 'producto', entidadId: req.params.id, accion: 'eliminar', descripcion: `Elimino producto #${req.params.id}` });

    return res.json({ success: true, data: { message: 'Producto eliminado' } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete product error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /api/productos/:id/duplicar
router.post('/:id/duplicar', async (req, res) => {
  const client = await pool.connect();
  try {
    const original = await client.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (original.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    const prod = original.rows[0];

    await client.query('BEGIN');

    const newProd = await client.query(
      `INSERT INTO productos (usuario_id, nombre, margen, igv_rate,
        costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.user.id, prod.nombre + ' (copia)', prod.margen, prod.igv_rate,
        prod.costo_insumos, prod.costo_empaque, prod.costo_neto, prod.precio_venta, prod.precio_final, prod.imagen_url]
    );
    const newId = newProd.rows[0].id;

    const preps = await client.query(
      'SELECT * FROM producto_preparaciones WHERE producto_id = $1 ORDER BY orden',
      [req.params.id]
    );
    for (const prep of preps.rows) {
      const newPrep = await client.query(
        'INSERT INTO producto_preparaciones (producto_id, nombre, orden, capacidad, unidad_capacidad) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [newId, prep.nombre, prep.orden, prep.capacidad, prep.unidad_capacidad]
      );
      const insRes = await client.query(
        'SELECT * FROM producto_prep_insumos WHERE producto_preparacion_id = $1',
        [prep.id]
      );
      for (const ins of insRes.rows) {
        await client.query(
          'INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad, uso_unidad) VALUES ($1, $2, $3, $4)',
          [newPrep.rows[0].id, ins.insumo_id, ins.cantidad, ins.uso_unidad || null]
        );
      }
    }

    const mats = await client.query(
      'SELECT * FROM producto_materiales WHERE producto_id = $1',
      [req.params.id]
    );
    for (const mat of mats.rows) {
      await client.query(
        'INSERT INTO producto_materiales (producto_id, material_id, cantidad, empaque_tipo) VALUES ($1, $2, $3, $4)',
        [newId, mat.material_id, mat.cantidad, mat.empaque_tipo || 'entero']
      );
    }

    await client.query(
      'INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final) VALUES ($1, 1, $2, $3, $4, $5)',
      [newId, JSON.stringify(newProd.rows[0]), 'Duplicado de producto #' + req.params.id, prod.costo_neto, prod.precio_final]
    );

    await client.query('COMMIT');

    return res.status(201).json({ success: true, data: newProd.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Duplicate product error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /api/productos/:id/restaurar/:version — restore a previous version
router.post('/:id/restaurar/:version', async (req, res) => {
  const client = await pool.connect();
  try {
    // Verify ownership
    const existing = await client.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    // Get the version snapshot
    const versionRes = await client.query(
      'SELECT * FROM producto_versiones WHERE producto_id = $1 AND version = $2',
      [req.params.id, req.params.version]
    );
    if (versionRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Version no encontrada' });
    }

    const snapshot = versionRes.rows[0].snapshot_json;

    await client.query('BEGIN');

    // Update the product with snapshot values
    await client.query(
      `UPDATE productos SET
        nombre = COALESCE($1, nombre),
        margen = COALESCE($2, margen),
        igv_rate = COALESCE($3, igv_rate),
        costo_insumos = COALESCE($4, costo_insumos),
        costo_empaque = COALESCE($5, costo_empaque),
        costo_neto = COALESCE($6, costo_neto),
        precio_venta = COALESCE($7, precio_venta),
        precio_final = COALESCE($8, precio_final),
        updated_at = NOW()
       WHERE id = $9`,
      [
        snapshot.nombre, snapshot.margen, snapshot.igv_rate,
        snapshot.costo_insumos, snapshot.costo_empaque, snapshot.costo_neto,
        snapshot.precio_venta, snapshot.precio_final,
        req.params.id
      ]
    );

    // Create a new version entry for the restoration
    const nextVersion = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM producto_versiones WHERE producto_id = $1',
      [req.params.id]
    );

    await client.query(
      'INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.params.id, nextVersion.rows[0].next, JSON.stringify(snapshot), `Restaurado a version ${req.params.version}`, snapshot.costo_neto || 0, snapshot.precio_final || 0]
    );

    await client.query('COMMIT');

    return res.json({ success: true, data: { message: `Restaurado a version ${req.params.version}` } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Restore version error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;
