const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// ==================== PREPARACIONES PREDETERMINADAS ====================

// GET /api/predeterminados/preparaciones
router.get('/preparaciones', async (req, res) => {
  try {
    const prepsRes = await pool.query(
      'SELECT * FROM preparaciones_predeterminadas WHERE usuario_id = $1 ORDER BY nombre ASC',
      [req.user.id]
    );

    const preps = [];
    for (const prep of prepsRes.rows) {
      const insRes = await pool.query(
        `SELECT ppi.id, ppi.insumo_id, ppi.cantidad,
                i.nombre, i.unidad_medida, i.precio_presentacion, i.cantidad_presentacion
         FROM prep_pred_insumos ppi
         JOIN insumos i ON i.id = ppi.insumo_id
         WHERE ppi.preparacion_pred_id = $1`,
        [prep.id]
      );
      preps.push({ ...prep, insumos: insRes.rows });
    }

    return res.json({ success: true, data: preps });
  } catch (err) {
    console.error('List prep predeterminadas error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/predeterminados/preparaciones
router.post('/preparaciones', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, insumos } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO preparaciones_predeterminadas (usuario_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.user.id, nombre]
    );
    const prep = result.rows[0];

    if (insumos && insumos.length > 0) {
      for (const ins of insumos) {
        await client.query(
          'INSERT INTO prep_pred_insumos (preparacion_pred_id, insumo_id, cantidad) VALUES ($1, $2, $3)',
          [prep.id, ins.insumo_id, ins.cantidad || 0]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({ success: true, data: prep });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /api/predeterminados/preparaciones/:id
router.put('/preparaciones/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, insumos } = req.body;

    const existing = await client.query(
      'SELECT id FROM preparaciones_predeterminadas WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Preparacion predeterminada no encontrada' });
    }

    await client.query('BEGIN');

    await client.query(
      'UPDATE preparaciones_predeterminadas SET nombre = COALESCE($1, nombre), updated_at = NOW() WHERE id = $2',
      [nombre, req.params.id]
    );

    if (insumos !== undefined) {
      await client.query('DELETE FROM prep_pred_insumos WHERE preparacion_pred_id = $1', [req.params.id]);
      if (insumos && insumos.length > 0) {
        for (const ins of insumos) {
          await client.query(
            'INSERT INTO prep_pred_insumos (preparacion_pred_id, insumo_id, cantidad) VALUES ($1, $2, $3)',
            [req.params.id, ins.insumo_id, ins.cantidad || 0]
          );
        }
      }
    }

    await client.query('COMMIT');

    return res.json({ success: true, data: { id: parseInt(req.params.id), nombre } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// DELETE /api/predeterminados/preparaciones/:id
router.delete('/preparaciones/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM preparaciones_predeterminadas WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Preparacion predeterminada no encontrada' });
    }

    return res.json({ success: true, data: { message: 'Preparacion predeterminada eliminada' } });
  } catch (err) {
    console.error('Delete prep predeterminada error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ==================== EMPAQUES PREDETERMINADOS ====================

// GET /api/predeterminados/empaques
router.get('/empaques', async (req, res) => {
  try {
    const empsRes = await pool.query(
      'SELECT * FROM empaques_predeterminados WHERE usuario_id = $1 ORDER BY nombre ASC',
      [req.user.id]
    );

    const empaques = [];
    for (const emp of empsRes.rows) {
      const matsRes = await pool.query(
        `SELECT epm.id, epm.material_id, epm.cantidad,
                m.nombre, m.unidad_medida, m.precio_presentacion, m.cantidad_presentacion
         FROM empaque_pred_materiales epm
         JOIN materiales m ON m.id = epm.material_id
         WHERE epm.empaque_pred_id = $1`,
        [emp.id]
      );
      empaques.push({ ...emp, materiales: matsRes.rows });
    }

    return res.json({ success: true, data: empaques });
  } catch (err) {
    console.error('List empaques predeterminados error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// POST /api/predeterminados/empaques
router.post('/empaques', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, materiales } = req.body;

    if (!nombre) {
      return res.status(400).json({ success: false, error: 'Nombre es requerido' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO empaques_predeterminados (usuario_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.user.id, nombre]
    );
    const emp = result.rows[0];

    if (materiales && materiales.length > 0) {
      for (const mat of materiales) {
        await client.query(
          'INSERT INTO empaque_pred_materiales (empaque_pred_id, material_id, cantidad) VALUES ($1, $2, $3)',
          [emp.id, mat.material_id, mat.cantidad || 1]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({ success: true, data: emp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /api/predeterminados/empaques/:id
router.put('/empaques/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, materiales } = req.body;

    const existing = await client.query(
      'SELECT id FROM empaques_predeterminados WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Empaque predeterminado no encontrado' });
    }

    await client.query('BEGIN');

    await client.query(
      'UPDATE empaques_predeterminados SET nombre = COALESCE($1, nombre), updated_at = NOW() WHERE id = $2',
      [nombre, req.params.id]
    );

    if (materiales !== undefined) {
      await client.query('DELETE FROM empaque_pred_materiales WHERE empaque_pred_id = $1', [req.params.id]);
      if (materiales && materiales.length > 0) {
        for (const mat of materiales) {
          await client.query(
            'INSERT INTO empaque_pred_materiales (empaque_pred_id, material_id, cantidad) VALUES ($1, $2, $3)',
            [req.params.id, mat.material_id, mat.cantidad || 1]
          );
        }
      }
    }

    await client.query('COMMIT');

    return res.json({ success: true, data: { id: parseInt(req.params.id), nombre } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// DELETE /api/predeterminados/empaques/:id
router.delete('/empaques/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM empaques_predeterminados WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Empaque predeterminado no encontrado' });
    }

    return res.json({ success: true, data: { message: 'Empaque predeterminado eliminado' } });
  } catch (err) {
    console.error('Delete empaque predeterminado error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
