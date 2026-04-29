const pool = require('../models/db');

/**
 * Log an audit event
 * @param {Object} params
 * @param {number} params.userId - Who performed the action
 * @param {string} params.userName - Display name (denormalized for fast display)
 * @param {string} params.entidad - Entity type: 'producto', 'venta', 'gasto', 'compra', 'insumo', etc.
 * @param {number} params.entidadId - Entity ID
 * @param {string} params.accion - Action: 'crear', 'editar', 'eliminar', 'emitir', 'anular', 'pagar', 'entregar'
 * @param {string} params.descripcion - Human-readable description in Spanish
 * @param {Object} [params.cambios] - Optional JSON with before/after values
 */
async function logAudit({ userId, userName, entidad, entidadId, accion, descripcion, cambios }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (usuario_id, usuario_nombre, entidad, entidad_id, accion, descripcion, cambios_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId || 0, userName || null, entidad, entidadId || null, accion, descripcion || null, cambios ? JSON.stringify(cambios) : null]
    );
  } catch (err) {
    console.error('[audit] Error:', err.message);
    // Never let audit failures break the main flow
  }
}

module.exports = { logAudit };
