const express = require('express');
const crypto = require('crypto');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { requirePermiso } = require('../middleware/permisos');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

// GET /api/equipo — list team members of my empresa
router.get('/', async (req, res) => {
  try {
    if (!req.user.empresa_id) return res.json({ success: true, data: [] });
    const result = await pool.query(
      `SELECT id, email, nombre, rol_empresa, estado, created_at
       FROM usuarios WHERE empresa_id = $1 ORDER BY rol_empresa, nombre`,
      [req.user.empresa_id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List equipo error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/equipo/invitar — invite a team member (owner only)
router.post('/invitar', requirePermiso('equipo', 'gestionar'), async (req, res) => {
  try {
    const { email, nombre, rol_empresa } = req.body;
    if (!email || !nombre) return res.status(400).json({ success: false, error: 'Email y nombre requeridos' });

    const validRoles = ['manager', 'cashier', 'kitchen', 'viewer', 'vendedor', 'repartidor', 'contador'];
    const rol = validRoles.includes(rol_empresa) ? rol_empresa : 'cashier';

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Este email ya esta registrado' });
    }

    // Check max_usuarios limit
    const empresa = await pool.query('SELECT max_usuarios FROM empresas WHERE id = $1', [req.user.empresa_id]);
    const currentCount = await pool.query('SELECT COUNT(*) FROM usuarios WHERE empresa_id = $1', [req.user.empresa_id]);
    if (parseInt(currentCount.rows[0].count) >= (empresa.rows[0]?.max_usuarios || 3)) {
      return res.status(403).json({ success: false, error: `Tu plan permite maximo ${empresa.rows[0]?.max_usuarios || 3} usuarios` });
    }

    const onboarding_token = crypto.randomBytes(32).toString('hex');
    const onboarding_expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO usuarios (email, nombre, rol, rol_empresa, empresa_id, estado, permisos, onboarding_token, onboarding_token_expires, password_hash)
       VALUES ($1, $2, 'cliente', $3, $4, 'pendiente', $5, $6, $7, '')
       RETURNING id, email, nombre, rol_empresa, estado, onboarding_token`,
      [email.toLowerCase().trim(), nombre, rol, req.user.empresa_id,
       JSON.stringify(["dashboard","cotizador","insumos","materiales","preparaciones","empaques","proyeccion","pl","perdidas","facturacion"]),
       onboarding_token, onboarding_expira]
    );

    logAudit({ userId: req.user.id, entidad: 'equipo', entidadId: result.rows[0].id, accion: 'crear',
      descripcion: `Invito a ${nombre} (${email}) como ${rol}` });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Invite error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PATCH /api/equipo/:id/rol — change member role (owner only)
router.patch('/:id/rol', requirePermiso('equipo', 'gestionar'), async (req, res) => {
  try {
    const { rol_empresa } = req.body;
    const validRoles = ['manager', 'cashier', 'kitchen', 'viewer', 'vendedor', 'repartidor', 'contador'];
    if (!validRoles.includes(rol_empresa)) {
      return res.status(400).json({ success: false, error: 'Rol invalido' });
    }

    // Can't change own role
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ success: false, error: 'No puedes cambiar tu propio rol' });
    }

    const result = await pool.query(
      'UPDATE usuarios SET rol_empresa = $1, updated_at = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING id, nombre, rol_empresa',
      [rol_empresa, req.params.id, req.user.empresa_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Miembro no encontrado' });

    logAudit({ userId: req.user.id, entidad: 'equipo', entidadId: req.params.id, accion: 'editar',
      descripcion: `Cambio rol de ${result.rows[0].nombre} a ${rol_empresa}` });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Change role error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/equipo/:id — remove member (owner only)
router.delete('/:id', requirePermiso('equipo', 'gestionar'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ success: false, error: 'No puedes eliminarte a ti mismo' });
    }

    const result = await pool.query(
      'UPDATE usuarios SET empresa_id = NULL, estado = $1, updated_at = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING id, nombre',
      ['inactivo', req.params.id, req.user.empresa_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Miembro no encontrado' });

    logAudit({ userId: req.user.id, entidad: 'equipo', entidadId: req.params.id, accion: 'eliminar',
      descripcion: `Removio a ${result.rows[0].nombre} del equipo` });

    return res.json({ success: true, data: { message: 'Miembro removido del equipo' } });
  } catch (err) {
    console.error('Remove member error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/equipo/permisos — get permission matrix for display
router.get('/permisos', async (req, res) => {
  const { PERMISOS } = require('../middleware/permisos');
  return res.json({ success: true, data: PERMISOS });
});

module.exports = router;
