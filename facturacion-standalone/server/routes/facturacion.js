const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { encryptCert, decryptCert, buildInvoiceJSON, round2 } = require('../utils/facturacion');
const { logAudit } = require('../utils/audit');
const { getSunatMessage } = require('../utils/sunat-codes');
const { getDateRange } = require('../utils/dateRange');

const router = express.Router();
router.use(auth);

// ==================== LYCET (Greenter self-hosted) ====================

function getLycetConfig() {
  return {
    url: process.env.LYCET_URL || 'http://localhost:8050/api/v1',
    token: process.env.LYCET_TOKEN || 'kudi-lycet-2026-secure',
  };
}

async function callLycet(path, body) {
  const { url, token } = getLycetConfig();
  const res = await fetch(`${url}${path}?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  // PDF endpoint returns binary, not JSON
  if (contentType.includes('application/pdf')) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return { pdf: buffer.toString('base64') };
  }
  return res.json();
}

// ==================== AUTO-ENABLE LOGIC ====================

async function autoHabilitarSiCompleto(userId) {
  try {
    const user = await pool.query('SELECT ruc FROM usuarios WHERE id = $1', [userId]);
    const config = await pool.query('SELECT direccion_fiscal, certificado_pem, habilitado, sol_user FROM facturacion_config WHERE usuario_id = $1', [userId]);

    if (!user.rows[0] || !config.rows[0]) return;

    const tieneRuc = !!user.rows[0].ruc && user.rows[0].ruc.length >= 11;
    const tieneDireccion = !!config.rows[0].direccion_fiscal;
    const tieneCert = !!config.rows[0].certificado_pem;
    const tieneSol = !!config.rows[0].sol_user;
    const yaHabilitado = config.rows[0].habilitado;

    if (tieneRuc && tieneDireccion && tieneCert && tieneSol && !yaHabilitado) {
      await pool.query(
        'UPDATE facturacion_config SET habilitado = true, updated_at = NOW() WHERE usuario_id = $1',
        [userId]
      );
      console.log(`[facturacion] Auto-habilitado para usuario ${userId}`);
    }
  } catch (err) {
    console.error('[facturacion] Auto-habilitar error:', err.message);
  }
}

// ==================== LYCET MULTI-COMPANY SYNC ====================

/**
 * Registers or updates a company in Lycet (self-hosted Greenter).
 * Lycet stores each company's cert + SOL credentials in empresas.json.
 * When an invoice is sent, Lycet matches the RUC in the invoice JSON
 * to the registered company config automatically.
 *
 * Required: RUC, SOL_USER (format: {ruc}{sol_user}), SOL_PASS, certificate (PEM base64)
 * Called when: certificate uploaded, SOL credentials changed
 */
async function syncLycetCompany(userId) {
  try {
    const userRes = await pool.query('SELECT ruc FROM usuarios WHERE id = $1', [userId]);
    const configRes = await pool.query(
      'SELECT sol_user, sol_pass, certificado_pem FROM facturacion_config WHERE usuario_id = $1',
      [userId]
    );
    const ruc = userRes.rows[0]?.ruc;
    const cfg = configRes.rows[0];
    if (!ruc) return;

    // Need at minimum SOL credentials and certificate to register
    if (!cfg?.sol_user || !cfg?.certificado_pem) {
      console.log('[lycet] Skip sync — missing sol_user or certificate for RUC:', ruc);
      return;
    }

    // Decrypt PEM from DB and base64-encode for Lycet
    const pemRaw = decryptCert(cfg.certificado_pem);
    const certBase64 = Buffer.from(pemRaw).toString('base64');

    const { url, token } = getLycetConfig();
    const res = await fetch(`${url}/configuration/company/${ruc}?token=${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SOL_USER: `${ruc}${cfg.sol_user}`,
        SOL_PASS: cfg.sol_pass,
        certificate: certBase64,
      }),
    });
    const data = await res.json();

    if (data.message) {
      console.log('[lycet] Company synced:', ruc, '-', data.message);
    } else {
      console.error('[lycet] Company sync failed:', ruc, JSON.stringify(data));
    }
  } catch (err) {
    console.error('[lycet] Sync error:', err.message);
  }
}

// ==================== RUC LOOKUP ====================

router.get('/buscar-ruc/:ruc', async (req, res) => {
  try {
    const { ruc } = req.params;
    if (!ruc || ruc.length !== 11) {
      return res.status(400).json({ success: false, error: 'RUC debe tener 11 dígitos' });
    }

    const peruApiKey = process.env.PERUAPI_KEY || '';
    let data = null;

    if (peruApiKey) {
      try {
        const r1 = await fetch(`https://peruapi.com/api/ruc/${ruc}?api_token=${peruApiKey}`);
        const d1 = await r1.json();
        if (d1.ruc || d1.razon_social) data = d1;
      } catch (_) {}
    }

    if (!data) {
      try {
        const r2 = await fetch(`https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`, { headers: { 'Accept': 'application/json' } });
        if (r2.ok) {
          const d2 = await r2.json();
          if (d2.razonSocial || d2.nombre) data = { razon_social: d2.razonSocial, direccion: d2.direccion, departamento: d2.departamento, provincia: d2.provincia, distrito: d2.distrito, ubigeo: d2.ubigeo, estado: d2.estado, condicion: d2.condicion };
        }
      } catch (_) {}
    }

    if (!data) {
      try {
        const r3 = await fetch(`https://apiperu.dev/api/ruc/${ruc}`, { headers: { 'Accept': 'application/json' } });
        if (r3.ok) {
          const d3 = await r3.json();
          data = d3.data || d3;
        }
      } catch (_) {}
    }

    if (!data || (!data.razon_social && !data.direccion)) {
      return res.status(404).json({ success: false, error: 'No se encontró en la base pública de SUNAT. Si tu RUC es nuevo o está suspendido, ingresa los datos manualmente desde tu Ficha RUC (Clave SOL).' });
    }

    return res.json({
      success: true,
      data: {
        ruc: data.numeroDocumento || ruc,
        razon_social: data.razonSocial || data.nombre || '',
        direccion: data.direccion || '',
        departamento: data.departamento || '',
        provincia: data.provincia || '',
        distrito: data.distrito || '',
        ubigeo: data.ubigeo || '',
        estado: data.estado || '',
        condicion: data.condicion || '',
      },
    });
  } catch (err) {
    console.error('RUC lookup error:', err);
    return res.status(500).json({ success: false, error: 'Error consultando RUC' });
  }
});

// ==================== CONFIG ====================

router.get('/config', async (req, res) => {
  try {
    let config = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    if (config.rows.length === 0) {
      config = await pool.query(
        'INSERT INTO facturacion_config (usuario_id) VALUES ($1) RETURNING *',
        [req.user.id]
      );
    }
    const c = config.rows[0];
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

router.put('/config', async (req, res) => {
  try {
    const { direccion_fiscal, departamento, provincia, distrito, ubigeo,
            serie_factura, serie_boleta, sol_user, sol_pass } = req.body;

    const result = await pool.query(
      `UPDATE facturacion_config SET
        direccion_fiscal = COALESCE($1, direccion_fiscal),
        departamento = COALESCE($2, departamento),
        provincia = COALESCE($3, provincia),
        distrito = COALESCE($4, distrito),
        ubigeo = COALESCE($5, ubigeo),
        serie_factura = COALESCE($6, serie_factura),
        serie_boleta = COALESCE($7, serie_boleta),
        sol_user = COALESCE($9, sol_user),
        sol_pass = COALESCE($10, sol_pass),
        updated_at = NOW()
       WHERE usuario_id = $8 RETURNING *`,
      [direccion_fiscal, departamento, provincia, distrito, ubigeo,
       serie_factura, serie_boleta, req.user.id, sol_user || null, sol_pass || null]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Config no encontrada' });

    // Sync SOL credentials with Lycet if changed
    if (sol_user || sol_pass) {
      await syncLycetCompany(req.user.id);
    }

    await autoHabilitarSiCompleto(req.user.id);

    const fresh = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    return res.json({ success: true, data: { ...fresh.rows[0], certificado_pem: undefined, certificado_subido: !!fresh.rows[0]?.certificado_pem } });
  } catch (err) {
    console.error('Update config error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/facturacion/validar-sol — test SOL credentials by sending a test invoice
router.post('/validar-sol', async (req, res) => {
  try {
    const userRes = await pool.query('SELECT ruc, razon_social, nombre_comercial FROM usuarios WHERE id = $1', [req.user.id]);
    const configRes = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    const usuario = userRes.rows[0];
    const config = configRes.rows[0];

    if (!usuario?.ruc) return res.status(400).json({ success: false, error: 'Configura tu RUC en Perfil primero' });
    if (!config?.sol_user) return res.status(400).json({ success: false, error: 'Ingresa tus credenciales SOL primero' });
    if (!config?.certificado_pem) return res.status(400).json({ success: false, error: 'Sube tu certificado digital primero' });

    // Sync with Lycet first
    await syncLycetCompany(req.user.id);

    // Send a test boleta with correlativo 0 (SUNAT rejects 0 but the auth/signing succeeds)
    const testInvoice = {
      ublVersion: '2.1', tipoOperacion: '0101', tipoDoc: '03',
      serie: 'B001', correlativo: '0',
      fechaEmision: (() => { const n = new Date(); const l = new Date(n.getTime() - 5*60*60*1000); return l.toISOString().replace(/\.\d{3}Z$/, '-05:00'); })(),
      tipoMoneda: 'PEN',
      formaPago: { moneda: 'PEN', tipo: 'Contado' },
      client: { tipoDoc: '0', numDoc: '00000000', rznSocial: 'TEST VALIDACION' },
      company: {
        ruc: parseInt(usuario.ruc),
        razonSocial: usuario.razon_social || '',
        nombreComercial: usuario.nombre_comercial || '',
        address: { direccion: config.direccion_fiscal || '', provincia: config.provincia || '', departamento: config.departamento || '', distrito: config.distrito || '', ubigueo: config.ubigeo || '' },
      },
      mtoOperGravadas: 1, mtoIGV: 0.18, totalImpuestos: 0.18, valorVenta: 1, subTotal: 1.18, mtoImpVenta: 1.18,
      details: [{ codProducto: 'TEST', unidad: 'NIU', descripcion: 'Validacion SOL', cantidad: 1, mtoValorUnitario: 1, mtoValorVenta: 1, mtoBaseIgv: 1, porcentajeIgv: 18, igv: 0.18, tipAfeIgv: 10, totalImpuestos: 0.18, mtoPrecioUnitario: 1.18 }],
      legends: [{ code: '1000', value: 'UNO CON 18/100 SOLES' }],
    };

    const apiRes = await callLycet('/invoice/send', testInvoice);
    const sr = apiRes.sunatResponse || {};
    const errCode = sr.error?.code || sr.cdrResponse?.code;
    const errMsg = sr.error?.message || sr.cdrResponse?.description;

    // If we get ANY response from SUNAT (even rejection), it means SOL auth worked
    if (apiRes.xml && apiRes.hash) {
      // Check specific errors
      if (errCode === '0111') {
        return res.json({ success: false, error: getSunatMessage('0111') });
      }
      // Any other SUNAT response (including rejections for correlativo 0) means auth works
      return res.json({ success: true, data: { message: 'Acceso SOL validado. Ya puedes emitir comprobantes.' } });
    }

    // No XML = connection/signing failed
    return res.json({ success: false, error: getSunatMessage('HTTP', apiRes.error || 'No se pudo conectar con SUNAT. Verifica tus credenciales SOL.') });
  } catch (err) {
    console.error('Validar SOL error:', err);
    return res.status(500).json({ success: false, error: 'Error validando credenciales' });
  }
});

// ==================== CERTIFICADO ====================

router.post('/certificado', async (req, res) => {
  try {
    const { cert_base64, cert_password } = req.body;
    if (!cert_base64) {
      return res.status(400).json({ success: false, error: 'Certificado requerido' });
    }

    // Convert P12 to PEM via local openssl
    let pemRaw = null;
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const tmpP12 = '/tmp/cert_upload_' + Date.now() + '.p12';
      const tmpPem = tmpP12 + '.pem';
      fs.writeFileSync(tmpP12, Buffer.from(cert_base64, 'base64'));
      execSync(`openssl pkcs12 -in ${tmpP12} -out ${tmpPem} -nodes -passin "pass:${(cert_password || '').replace(/"/g, '\\"')}" -legacy 2>/dev/null || openssl pkcs12 -in ${tmpP12} -out ${tmpPem} -nodes -passin "pass:${(cert_password || '').replace(/"/g, '\\"')}" 2>/dev/null`);
      pemRaw = fs.readFileSync(tmpPem, 'utf8');
      fs.unlinkSync(tmpP12);
      fs.unlinkSync(tmpPem);
    } catch (localErr) {
      console.log('[cert] Local conversion failed:', localErr.message);
      return res.status(400).json({ success: false, error: 'Error convirtiendo certificado. Verifica la contraseña.' });
    }

    // Encrypt and store the PEM in DB
    const encryptedPem = encryptCert(pemRaw);
    await pool.query(
      `UPDATE facturacion_config SET certificado_pem = $1, certificado_subido = true, updated_at = NOW() WHERE usuario_id = $2`,
      [encryptedPem, req.user.id]
    );

    await autoHabilitarSiCompleto(req.user.id);

    // Sync company with Lycet (registers cert + SOL credentials automatically)
    await syncLycetCompany(req.user.id);

    return res.json({ success: true, data: { message: 'Certificado guardado correctamente' } });
  } catch (err) {
    console.error('Upload cert error:', err);
    return res.status(500).json({ success: false, error: 'Error procesando certificado' });
  }
});

// ==================== EMISION ====================

router.post('/emitir', async (req, res) => {
  try {
    const { venta_id, transaccion_id, tipo, cliente_id, items } = req.body;
    if (!tipo || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Tipo e items requeridos' });
    }

    // Get config
    const configRes = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    if (configRes.rows.length === 0 || !configRes.rows[0].habilitado) {
      return res.status(403).json({ success: false, error: 'Facturación no habilitada. Completa la configuración primero.' });
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
      const clienteRes = await pool.query('SELECT * FROM clientes WHERE id = $1 AND empresa_id = $2', [cliente_id, req.eid]);
      cliente = clienteRes.rows[0] || null;
    }

    if (tipo === 'factura' && (!cliente || cliente.tipo_doc !== '6')) {
      return res.status(400).json({ success: false, error: 'Para factura se requiere un cliente con RUC' });
    }

    // Build venta object from items
    const venta = {
      descuento: items.reduce((s, i) => s + (parseFloat(i.descuento) || 0), 0),
    };

    // Build invoice JSON (same Greenter/UBL 2.1 format — compatible with Lycet)
    const { invoice, serie, correlativo, totalValorVenta, totalIGV, totalFinal } = buildInvoiceJSON({
      tipo, venta, productos: items, usuario, config, cliente,
    });

    // Send to Lycet (self-hosted Greenter)
    console.log('[facturacion] Sending to Lycet:', JSON.stringify({ serie: invoice.serie, correlativo: invoice.correlativo, ruc: invoice.company?.ruc, tipoDoc: invoice.tipoDoc }));
    const apiRes = await callLycet('/invoice/send', invoice);
    console.log('[facturacion] Lycet response keys:', Object.keys(apiRes));

    // Parse response — Lycet/Greenter uses same format as APIsPeru:
    // Success: { xml, hash, sunatResponse: { success: true, cdrZip, cdrResponse: { id, code: "0", description } } }
    // SUNAT error: { xml, hash, sunatResponse: { success: false, error: { code, message } } }
    const sr = apiRes.sunatResponse || {};
    const cdrResp = sr.cdrResponse || {};
    const srError = sr.error || {};
    const isSuccess = sr.success === true || cdrResp.code === '0';

    let sunatMessage = cdrResp.description || null;
    let sunatCode = cdrResp.code || null;

    if (!sunatMessage && typeof srError === 'object' && srError.message) {
      sunatCode = srError.code || null;
      sunatMessage = getSunatMessage(srError.code, srError.message);
    }
    if (!sunatMessage && apiRes.error) {
      sunatMessage = getSunatMessage('HTTP', apiRes.error);
    }

    console.log('[facturacion] SUNAT result:', { success: isSuccess, code: sunatCode, message: sunatMessage });

    // Save comprobante
    const compRes = await pool.query(
      `INSERT INTO comprobantes (usuario_id, empresa_id, venta_id, transaccion_id, tipo_doc, serie, correlativo, fecha_emision,
        cliente_tipo_doc, cliente_num_doc, cliente_razon_social, cliente_direccion,
        mto_oper_gravadas, mto_igv, mto_total, moneda,
        sunat_success, sunat_code, sunat_message, sunat_xml, sunat_cdr, sunat_hash,
        estado, detalle_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'America/Lima'), $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING *`,
      [
        req.uid, req.eid, venta_id || null, transaccion_id || null,
        tipo === 'factura' ? '01' : '03', serie, correlativo,
        cliente?.tipo_doc || '0', cliente?.num_doc || '00000000',
        cliente?.razon_social || 'VARIOS', cliente?.direccion || null,
        totalValorVenta, totalIGV, totalFinal, 'PEN',
        isSuccess, sunatCode, sunatMessage,
        apiRes.xml || null, sr.cdrZip || null, apiRes.hash || null,
        isSuccess ? 'emitido' : 'error',
        JSON.stringify(items),
      ]
    );

    if (isSuccess) {
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
        sunat: { success: isSuccess, code: sunatCode, message: sunatMessage },
      },
    });
  } catch (err) {
    console.error('Emitir error:', err);
    return res.status(500).json({ success: false, error: 'Error emitiendo comprobante' });
  }
});

// ==================== PDF ====================

router.get('/pdf/:id', async (req, res) => {
  try {
    const comp = await pool.query(
      'SELECT * FROM comprobantes WHERE id = $1 AND empresa_id = $2',
      [req.params.id, req.eid]
    );
    if (comp.rows.length === 0) return res.status(404).json({ success: false, error: 'Comprobante no encontrado' });

    const c = comp.rows[0];

    const userRes = await pool.query('SELECT ruc, razon_social, nombre_comercial, igv_rate FROM usuarios WHERE id = $1', [req.user.id]);
    const configRes = await pool.query('SELECT * FROM facturacion_config WHERE usuario_id = $1', [req.user.id]);
    const usuario = userRes.rows[0];
    const config = configRes.rows[0];

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

    invoice.serie = c.serie;
    invoice.correlativo = c.correlativo;
    // Format date for Lycet: no milliseconds, Peru timezone
    const d = new Date(c.fecha_emision);
    invoice.fechaEmision = d.toISOString().replace(/\.\d{3}Z$/, '-05:00');

    const pdfRes = await callLycet('/invoice/pdf', invoice);

    if (pdfRes.pdf) {
      return res.json({ success: true, data: { pdf: pdfRes.pdf } });
    }

    return res.status(500).json({ success: false, error: 'Error generando PDF' });
  } catch (err) {
    console.error('PDF error:', err);
    return res.status(500).json({ success: false, error: 'Error generando PDF' });
  }
});

// ==================== COMPROBANTES LIST ====================

router.get('/comprobantes', async (req, res) => {
  try {
    const { tipo_doc, limit: lim } = req.query;
    const { start, end } = await getDateRange(req);
    let query = `SELECT c.*,
      v.producto_id, v.cantidad AS venta_cantidad, v.fecha AS venta_fecha,
      p.nombre AS producto_nombre
      FROM comprobantes c
      LEFT JOIN ventas v ON v.id = c.venta_id
      LEFT JOIN productos p ON p.id = v.producto_id
      WHERE c.empresa_id = $1 AND c.fecha_emision BETWEEN $2 AND $3`;
    const params = [req.eid, start, end];
    let idx = 4;

    if (tipo_doc) {
      query += ` AND c.tipo_doc = $${idx++}`;
      params.push(tipo_doc);
    }

    query += ' ORDER BY c.created_at DESC';
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

// ==================== ANULAR ====================

router.post('/anular/:id', async (req, res) => {
  try {
    const comp = await pool.query(
      'SELECT * FROM comprobantes WHERE id = $1 AND empresa_id = $2 AND estado = $3',
      [req.params.id, req.eid, 'emitido']
    );
    if (comp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Comprobante no encontrado o ya anulado' });
    }

    await pool.query('UPDATE comprobantes SET estado = $1 WHERE id = $2', ['anulado', req.params.id]);

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

// DELETE /api/facturacion/comprobantes/rechazados — bulk delete failed comprobantes
router.delete('/comprobantes/rechazados', async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM comprobantes WHERE empresa_id = $1 AND estado = 'error' RETURNING id",
      [req.eid]
    );
    const count = result.rows.length;
    if (count > 0) {
      logAudit({ userId: req.user.id, entidad: 'comprobante', entidadId: null, accion: 'limpiar', descripcion: `Elimino ${count} comprobantes rechazados` });
    }
    return res.json({ success: true, data: { message: `${count} comprobantes rechazados eliminados`, count } });
  } catch (err) {
    console.error('Delete rechazados error:', err);
    return res.status(500).json({ success: false, error: 'Error eliminando' });
  }
});

// ==================== ADMIN ====================

router.put('/habilitar/:userId', async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user.id]);
    if (adminCheck.rows[0]?.rol !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo admin puede habilitar facturacion' });
    }

    const { habilitado } = req.body;

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
