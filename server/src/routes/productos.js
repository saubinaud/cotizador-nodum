const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { calcularCostos, round4 } = require('../services/calculador');

const router = express.Router();

router.use(auth);

// POST /api/productos
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, margen, preparaciones, materiales } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    const igv_rate = req.user.igv_rate || 0.18;

    await client.query('BEGIN');

    const prodRes = await client.query(
      `INSERT INTO productos (usuario_id, nombre, margen, igv_rate)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, nombre, margen || 0, igv_rate]
    );
    const producto = prodRes.rows[0];

    let allInsumos = [];
    if (preparaciones && preparaciones.length > 0) {
      for (const prep of preparaciones) {
        const prepRes = await client.query(
          `INSERT INTO producto_preparaciones (producto_id, nombre, orden)
           VALUES ($1, $2, $3) RETURNING id`,
          [producto.id, prep.nombre, prep.orden || 0]
        );
        const prepId = prepRes.rows[0].id;

        if (prep.insumos && prep.insumos.length > 0) {
          for (const ins of prep.insumos) {
            await client.query(
              `INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad)
               VALUES ($1, $2, $3)`,
              [prepId, ins.insumo_id, ins.cantidad_usada || ins.cantidad]
            );

            const insumoData = await client.query(
              'SELECT precio_presentacion, cantidad_presentacion FROM insumos WHERE id = $1',
              [ins.insumo_id]
            );
            if (insumoData.rows.length > 0) {
              allInsumos.push({
                precio_presentacion: parseFloat(insumoData.rows[0].precio_presentacion),
                cantidad_presentacion: parseFloat(insumoData.rows[0].cantidad_presentacion),
                cantidad_usada: parseFloat(ins.cantidad_usada || ins.cantidad),
              });
            }
          }
        }
      }
    }

    let costo_empaque = 0;
    if (materiales && materiales.length > 0) {
      for (const mat of materiales) {
        await client.query(
          `INSERT INTO producto_materiales (producto_id, material_id, cantidad)
           VALUES ($1, $2, $3)`,
          [producto.id, mat.material_id, mat.cantidad]
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

    const costos = calcularCostos({
      insumos: allInsumos,
      costo_empaque,
      margen: parseFloat(margen) || 0,
      igv_rate,
    });

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

    await client.query('COMMIT');

    return res.status(201).json({ success: true, data: { ...producto, ...costos } });
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
              created_at, updated_at
       FROM productos
       WHERE usuario_id = $1
       ORDER BY nombre ASC`,
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List products error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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
        `SELECT ppi.id, ppi.insumo_id, ppi.cantidad AS cantidad_usada,
                i.nombre, i.unidad_medida, i.precio_presentacion, i.cantidad_presentacion
         FROM producto_prep_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         WHERE ppi.producto_preparacion_id = $1`,
        [prep.id]
      );
      preparaciones.push({ ...prep, insumos: insRes.rows });
    }

    const matsRes = await pool.query(
      `SELECT pm.id, pm.material_id, pm.cantidad,
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
    const { nombre, margen, preparaciones, materiales } = req.body;

    const existing = await client.query(
      'SELECT * FROM productos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const igv_rate = req.user.igv_rate || 0.18;

    await client.query('BEGIN');

    await client.query(
      `UPDATE productos SET
        nombre = COALESCE($1, nombre),
        margen = COALESCE($2, margen),
        igv_rate = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [nombre, margen, igv_rate, req.params.id]
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
            'INSERT INTO producto_preparaciones (producto_id, nombre, orden) VALUES ($1, $2, $3) RETURNING id',
            [req.params.id, prep.nombre, prep.orden || 0]
          );
          const prepId = prepRes.rows[0].id;

          if (prep.insumos && prep.insumos.length > 0) {
            for (const ins of prep.insumos) {
              await client.query(
                'INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad) VALUES ($1, $2, $3)',
                [prepId, ins.insumo_id, ins.cantidad_usada || ins.cantidad]
              );

              const insumoData = await client.query(
                'SELECT precio_presentacion, cantidad_presentacion FROM insumos WHERE id = $1',
                [ins.insumo_id]
              );
              if (insumoData.rows.length > 0) {
                allInsumos.push({
                  precio_presentacion: parseFloat(insumoData.rows[0].precio_presentacion),
                  cantidad_presentacion: parseFloat(insumoData.rows[0].cantidad_presentacion),
                  cantidad_usada: parseFloat(ins.cantidad_usada || ins.cantidad),
                });
              }
            }
          }
        }
      }
    } else {
      const insumosRes = await client.query(
        `SELECT ppi.cantidad AS cantidad_usada, i.precio_presentacion, i.cantidad_presentacion
         FROM producto_prep_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id
         WHERE pp.producto_id = $1`,
        [req.params.id]
      );
      allInsumos = insumosRes.rows.map((r) => ({
        precio_presentacion: parseFloat(r.precio_presentacion),
        cantidad_presentacion: parseFloat(r.cantidad_presentacion),
        cantidad_usada: parseFloat(r.cantidad_usada),
      }));
    }

    let costo_empaque = 0;
    if (materiales !== undefined) {
      await client.query('DELETE FROM producto_materiales WHERE producto_id = $1', [req.params.id]);

      if (materiales && materiales.length > 0) {
        for (const mat of materiales) {
          await client.query(
            'INSERT INTO producto_materiales (producto_id, material_id, cantidad) VALUES ($1, $2, $3)',
            [req.params.id, mat.material_id, mat.cantidad]
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

    const effectiveMargen = margen !== undefined ? parseFloat(margen) : parseFloat(existing.rows[0].margen) || 0;
    const costos = calcularCostos({
      insumos: allInsumos,
      costo_empaque,
      margen: effectiveMargen,
      igv_rate,
    });

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

    await client.query('COMMIT');

    return res.json({ success: true, data: { ...updatedProd.rows[0], ...costos } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update product error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
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
        costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.id, prod.nombre + ' (copia)', prod.margen, prod.igv_rate,
        prod.costo_insumos, prod.costo_empaque, prod.costo_neto, prod.precio_venta, prod.precio_final]
    );
    const newId = newProd.rows[0].id;

    const preps = await client.query(
      'SELECT * FROM producto_preparaciones WHERE producto_id = $1 ORDER BY orden',
      [req.params.id]
    );
    for (const prep of preps.rows) {
      const newPrep = await client.query(
        'INSERT INTO producto_preparaciones (producto_id, nombre, orden) VALUES ($1, $2, $3) RETURNING id',
        [newId, prep.nombre, prep.orden]
      );
      const insRes = await client.query(
        'SELECT * FROM producto_prep_insumos WHERE producto_preparacion_id = $1',
        [prep.id]
      );
      for (const ins of insRes.rows) {
        await client.query(
          'INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad) VALUES ($1, $2, $3)',
          [newPrep.rows[0].id, ins.insumo_id, ins.cantidad]
        );
      }
    }

    const mats = await client.query(
      'SELECT * FROM producto_materiales WHERE producto_id = $1',
      [req.params.id]
    );
    for (const mat of mats.rows) {
      await client.query(
        'INSERT INTO producto_materiales (producto_id, material_id, cantidad) VALUES ($1, $2, $3)',
        [newId, mat.material_id, mat.cantidad]
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

module.exports = router;
