const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { encryptCert, decryptCert, buildInvoiceJSON, round2 } = require('../utils/facturacion');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

const APISPERU_BASE = process.env.APISPERU_BASE_URL || 'https://facturacion.apisperu.com/api/v1';
const APISPERU_EMAIL = process.env.APISPERU_EMAIL || '';
const APISPERU_PASSWORD = process.env.APISPERU_PASSWORD || '';

// Token cache (auto-refresh every 23 hours)
let _apisperuToken = null;
let _apisperuTokenExpires = 0;

async function getApisperuToken() {
  if (_apisperuToken && Date.now() < _apisperuTokenExpires) return _apisperuToken;
  try {
    const res = await fetch(`${APISPERU_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: APISPERU_EMAIL, password: APISPERU_PASSWORD }),
    });
    const data = await res.json();
    if (data.token) {
      _apisperuToken = data.token;
      _apisperuTokenExpires = Date.now() + 23 * 60 * 60 * 1000; // 23h
      console.log('[apisperu] Token refreshed');
    }
    return _apisperuToken;
  } catch (err) {
    console.error('[apisperu] Login error:', err.message);
    return _apisperuToken; // return stale token if refresh fails
  }
}

// Helper: call APIsPeru with auto-login
async function callApisPeru(path, body) {
  const token = await getApisperuToken();
  const res = await fetch(`${APISPERU_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ==================== CONFIG ====================

// GET /api/facturacion/config
router.get('/config', async (req, res) => {
  try {
    let config = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    if (config.rows.length === 0) {
      // Auto-create config
      config = await pool.query(
        'INSERT INTO facturacion_config (usuario_id) VALUES ($1) RETURNING *',
        [req.user.id]
      );
    }
    const c = config.rows[0];
    // Don't send the encrypted cert to frontend
    return res.json({
      success: true,
      data: {
        ...c,
        certificado_pem: undefined,
        certificado_subido: !!c.certificado_pem,
      },
    });
  } catch (err) {
    console.error('Get facturacion config error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/facturacion/config — update config (admin or self)
router.put('/config', async (req, res) => {
  try {
    const { direccion_fiscal, departamento, provincia, distrito, ubigeo,
            serie_factura, serie_boleta } = req.body;

    const result = await pool.query(
      `UPDATE facturacion_config SET
        direccion_fiscal = COALESCE($1, direccion_fiscal),
        departamento = COALESCE($2, departamento),
        provincia = COALESCE($3, provincia),
        distrito = COALESCE($4, distrito),
        ubigeo = COALESCE($5, ubigeo),
        serie_factura = COALESCE($6, serie_factura),
        serie_boleta = COALESCE($7, serie_boleta),
        updated_at = NOW()
       WHERE usuario_id = $8 RETURNING *`,
      [direccion_fiscal, departamento, provincia, distrito, ubigeo,
       serie_factura, serie_boleta, req.user.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Config no encontrada' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update config error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/facturacion/certificado — upload .p12 certificate
router.post('/certificado', async (req, res) => {
  try {
    const { cert_base64, cert_password } = req.body;
    if (!cert_base64 || !cert_password) {
      return res.status(400).json({ success: false, error: 'Certificado y contrasena requeridos' });
    }

    // Convert P12 to PEM via APIsPeru
    const convertRes = await callApisPeru('/companies/certificate', {
      cert: cert_base64,
      cert_pass: cert_password,
      base64: true,
    });

    if (!convertRes.pem) {
      return res.status(400).json({ success: false, error: 'Error convirtiendo certificado. Verifica la contrasena.' });
    }

    // Encrypt and store the PEM
    const encryptedPem = encryptCert(convertRes.pem);

    await pool.query(
      `UPDATE facturacion_config SET
        certificado_pem = $1, certificado_subido = true, updated_at = NOW()
       WHERE usuario_id = $2`,
      [encryptedPem, req.user.id]
    );

    return res.json({ success: true, data: { message: 'Certificado guardado correctamente' } });
  } catch (err) {
    console.error('Upload cert error:', err);
    return res.status(500).json({ success: false, error: 'Error procesando certificado' });
  }
});

// ==================== EMISION ====================

// POST /api/facturacion/emitir — emit boleta or factura
router.post('/emitir', async (req, res) => {
  try {
    const { venta_id, transaccion_id, tipo, cliente_id, items } = req.body;
    // tipo: 'boleta' | 'factura'
    if (!tipo || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Tipo e items requeridos' });
    }

    // Get config
    const configRes = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    if (configRes.rows.length === 0 || !configRes.rows[0].habilitado) {
      return res.status(403).json({ success: false, error: 'Facturacion no habilitada. Contacta al administrador.' });
    }
    const config = configRes.rows[0];

    // Get user data
    const userRes = await pool.query(
      'SELECT ruc, razon_social, nombre_comercial, igv_rate, tipo_negocio FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    const usuario = userRes.rows[0];
    if (!usuario.ruc) {
      return res.status(400).json({ success: false, error: 'RUC no configurado en tu perfil' });
    }

    // Get client data if provided
    let cliente = null;
    if (cliente_id) {
      const clienteRes = await pool.query('SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2', [cliente_id, req.user.id]);
      cliente = clienteRes.rows[0] || null;
    }

    // For factura, client with RUC is required
    if (tipo === 'factura' && (!cliente || cliente.tipo_doc !== '6')) {
      return res.status(400).json({ success: false, error: 'Para factura se requiere un cliente con RUC' });
    }

    // Build venta object from items
    const venta = {
      descuento: items.reduce((s, i) => s + (parseFloat(i.descuento) || 0), 0),
    };

    // Build invoice JSON
    const { invoice, serie, correlativo, totalValorVenta, totalIGV, totalFinal } = buildInvoiceJSON({
      tipo,
      venta,
      productos: items,
      usuario,
      config,
      cliente,
    });

    // Send to APIsPeru
    const sunatRes = await callApisPeru('/invoice/send', invoice);

    // Save comprobante
    const compRes = await pool.query(
      `INSERT INTO comprobantes (usuario_id, venta_id, transaccion_id, tipo_doc, serie, correlativo, fecha_emision,
        cliente_tipo_doc, cliente_num_doc, cliente_razon_social, cliente_direccion,
        mto_oper_gravadas, mto_igv, mto_total, moneda,
        sunat_success, sunat_code, sunat_message, sunat_xml, sunat_cdr, sunat_hash,
        estado, detalle_json)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
        req.user.id, venta_id || null, transaccion_id || null,
        tipo === 'factura' ? '01' : '03', serie, correlativo,
        cliente?.tipo_doc || '0', cliente?.num_doc || '00000000',
        cliente?.razon_social || 'VARIOS', cliente?.direccion || null,
        totalValorVenta, totalIGV, totalFinal, 'PEN',
        sunatRes.success || false, sunatRes.code || null, sunatRes.message || sunatRes.description || null,
        sunatRes.xml || null, sunatRes.cdr || null, sunatRes.hash || null,
        sunatRes.success ? 'emitido' : 'error',
        JSON.stringify(items),
      ]
    );

    // If successful, increment correlativo and mark venta as facturada
    if (sunatRes.success) {
      const corField = tipo === 'factura' ? 'correlativo_factura' : 'correlativo_boleta';
      await pool.query(
        `UPDATE facturacion_config SET ${corField} = ${corField} + 1, updated_at = NOW() WHERE usuario_id = $1`,
        [req.user.id]
      );

      if (venta_id) {
        await pool.query('UPDATE ventas SET facturado = true, comprobante_id = $1 WHERE id = $2', [compRes.rows[0].id, venta_id]);
      }
      if (transaccion_id) {
        await pool.query('UPDATE transacciones SET facturado = true, comprobante_id = $1 WHERE id = $2', [compRes.rows[0].id, transaccion_id]);
      }
    }

    logAudit({ userId: req.user.id, entidad: 'comprobante', entidadId: compRes.rows[0].id, accion: 'emitir', descripcion: `Emitio ${tipo === 'factura' ? 'factura' : 'boleta'} ${serie}-${correlativo} por S/${totalFinal}` });

    return res.json({
      success: true,
      data: {
        comprobante: compRes.rows[0],
        sunat: {
          success: sunatRes.success,
          code: sunatRes.code,
          message: sunatRes.message || sunatRes.description,
        },
      },
    });
  } catch (err) {
    console.error('Emitir error:', err);
    return res.status(500).json({ success: false, error: 'Error emitiendo comprobante' });
  }
});

// GET /api/facturacion/pdf/:id — regenerate PDF on demand
router.get('/pdf/:id', async (req, res) => {
  try {
    const comp = await pool.query(
      'SELECT * FROM comprobantes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (comp.rows.length === 0) return res.status(404).json({ success: false, error: 'Comprobante no encontrado' });

    const c = comp.rows[0];

    // Get user and config for company data
    const userRes = await pool.query('SELECT ruc, razon_social, nombre_comercial, igv_rate FROM usuarios WHERE id = $1', [req.user.id]);
    const configRes = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    const usuario = userRes.rows[0];
    const config = configRes.rows[0];

    // Rebuild the invoice JSON from stored data
    const items = typeof c.detalle_json === 'string' ? JSON.parse(c.detalle_json) : c.detalle_json;

    const { invoice } = buildInvoiceJSON({
      tipo: c.tipo_doc === '01' ? 'factura' : 'boleta',
      venta: { descuento: 0 },
      productos: items,
      usuario,
      config,
      cliente: {
        tipo_doc: c.cliente_tipo_doc,
        num_doc: c.cliente_num_doc,
        razon_social: c.cliente_razon_social,
        direccion: c.cliente_direccion,
      },
    });

    // Override serie/correlativo with stored values
    invoice.serie = c.serie;
    invoice.correlativo = c.correlativo;
    invoice.fechaEmision = c.fecha_emision;

    const pdfRes = await callApisPeru('/invoice/pdf', invoice);

    if (pdfRes.pdf) {
      // Return base64 PDF
      return res.json({ success: true, data: { pdf: pdfRes.pdf } });
    }

    return res.status(500).json({ success: false, error: 'Error generando PDF' });
  } catch (err) {
    console.error('PDF error:', err);
    return res.status(500).json({ success: false, error: 'Error generando PDF' });
  }
});

// GET /api/facturacion/comprobantes?periodo_id=X
router.get('/comprobantes', async (req, res) => {
  try {
    const { periodo_id, tipo_doc, limit: lim } = req.query;
    let query = 'SELECT * FROM comprobantes WHERE usuario_id = $1';
    const params = [req.user.id];
    let idx = 2;

    if (periodo_id) {
      const per = await pool.query('SELECT fecha_inicio, fecha_fin FROM periodos WHERE id = $1', [periodo_id]);
      if (per.rows.length > 0) {
        query += ` AND fecha_emision BETWEEN $${idx} AND $${idx + 1}`;
        params.push(per.rows[0].fecha_inicio, per.rows[0].fecha_fin);
        idx += 2;
      }
    }
    if (tipo_doc) {
      query += ` AND tipo_doc = $${idx++}`;
      params.push(tipo_doc);
    }

    query += ' ORDER BY fecha_emision DESC, created_at DESC';
    if (lim) {
      query += ` LIMIT $${idx++}`;
      params.push(parseInt(lim));
    }

    const result = await pool.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List comprobantes error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/facturacion/anular/:id — issue credit note
router.post('/anular/:id', async (req, res) => {
  try {
    const comp = await pool.query(
      'SELECT * FROM comprobantes WHERE id = $1 AND usuario_id = $2 AND estado = $3',
      [req.params.id, req.user.id, 'emitido']
    );
    if (comp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Comprobante no encontrado o ya anulado' });
    }

    // Mark as anulado
    await pool.query('UPDATE comprobantes SET estado = $1 WHERE id = $2', ['anulado', req.params.id]);

    // Unmark venta
    if (comp.rows[0].venta_id) {
      await pool.query('UPDATE ventas SET facturado = false, comprobante_id = NULL WHERE id = $1', [comp.rows[0].venta_id]);
    }

    logAudit({ userId: req.user.id, entidad: 'comprobante', entidadId: req.params.id, accion: 'anular', descripcion: `Anulo comprobante #${req.params.id}` });

    return res.json({ success: true, data: { message: 'Comprobante anulado' } });
  } catch (err) {
    console.error('Anular error:', err);
    return res.status(500).json({ success: false, error: 'Error anulando' });
  }
});

// PUT /api/facturacion/habilitar/:userId — admin enables invoicing for a user
router.put('/habilitar/:userId', async (req, res) => {
  try {
    // Check if requester is admin
    const adminCheck = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user.id]);
    if (adminCheck.rows[0]?.rol !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo admin puede habilitar facturacion' });
    }

    const { habilitado } = req.body;

    // Ensure config exists
    await pool.query(
      'INSERT INTO facturacion_config (usuario_id) VALUES ($1) ON CONFLICT (usuario_id) DO NOTHING',
      [req.params.userId]
    );

    await pool.query(
      'UPDATE facturacion_config SET habilitado = $1, updated_at = NOW() WHERE usuario_id = $2',
      [habilitado !== false, req.params.userId]
    );

    return res.json({ success: true, data: { message: habilitado !== false ? 'Facturacion habilitada' : 'Facturacion deshabilitada' } });
  } catch (err) {
    console.error('Habilitar error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
