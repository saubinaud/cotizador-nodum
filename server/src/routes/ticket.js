const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

const router = express.Router();

// Support token in query param for new-tab printing
router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});
router.use(auth);

// GET /api/ticket/:comprobanteId — HTML thermal receipt (80mm)
router.get('/:comprobanteId', async (req, res) => {
  try {
    // Fetch comprobante + venta items
    const compRes = await pool.query(
      `SELECT c.*, v.fecha AS venta_fecha, v.nota,
        json_agg(json_build_object(
          'nombre', COALESCE(p.nombre, 'Producto'),
          'cantidad', COALESCE(vi.cantidad, v.cantidad),
          'precio', COALESCE(vi.precio_unitario, v.precio_unitario),
          'subtotal', COALESCE(vi.subtotal, v.total)
        )) as items
       FROM comprobantes c
       LEFT JOIN ventas v ON v.id = c.venta_id
       LEFT JOIN venta_items vi ON vi.venta_id = v.id
       LEFT JOIN productos p ON p.id = vi.producto_id
       WHERE c.id = $1 AND c.empresa_id = $2
       GROUP BY c.id, v.id`,
      [req.params.comprobanteId, req.eid]
    );

    if (compRes.rows.length === 0) {
      return res.status(404).send('Comprobante no encontrado');
    }

    const c = compRes.rows[0];

    // If items aggregation returned [null], fall back to detalle_json
    let items = c.items;
    if (!items || (items.length === 1 && items[0].nombre === null)) {
      const detalle = typeof c.detalle_json === 'string' ? JSON.parse(c.detalle_json) : c.detalle_json;
      if (Array.isArray(detalle)) {
        items = detalle.map(d => ({
          nombre: d.descripcion || d.nombre || 'Producto',
          cantidad: d.cantidad || 1,
          precio: d.mtoValorUnitario || d.mtoPrecioUnitario || d.precio || 0,
          subtotal: d.mtoValorVenta || d.subtotal || 0,
        }));
      } else {
        items = [];
      }
    }

    // Fetch empresa data
    const empresaRes = await pool.query(
      'SELECT ruc, razon_social, nombre_comercial FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    const empresa = empresaRes.rows[0] || {};

    // Fetch facturacion config for direccion
    const configRes = await pool.query(
      'SELECT direccion_fiscal, departamento, provincia, distrito FROM facturacion_config WHERE usuario_id = $1',
      [req.user.id]
    );
    const config = configRes.rows[0] || {};

    const serie = c.serie || '';
    const correlativo = c.correlativo || '';
    const tipoDoc = c.tipo_doc || '03';

    // Format date
    const fecha = c.fecha_emision || c.created_at;
    const fechaObj = new Date(fecha);
    const fechaFormateada = fechaObj.toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Lima',
    });

    const mtoOperGravadas = r2(c.mto_oper_gravadas).toFixed(2);
    const mtoIgv = r2(c.mto_igv).toFixed(2);
    const mtoTotal = r2(c.mto_total).toFixed(2);

    const clienteRazonSocial = c.cliente_razon_social || 'VARIOS';
    const clienteTipoDoc = c.cliente_tipo_doc || '0';
    const clienteNumDoc = c.cliente_num_doc || '';
    const sunatHash = c.sunat_hash || '';

    const itemsHtml = items.map(i => `
    <tr>
      <td class="item-name">${escHtml(i.nombre || 'Producto')}</td>
      <td class="item-qty">${i.cantidad || 1}</td>
      <td class="item-price">${r2(i.precio).toFixed(2)}</td>
      <td class="item-total">${r2(i.subtotal).toFixed(2)}</td>
    </tr>`).join('');

    const clienteSection = clienteRazonSocial !== 'VARIOS' ? `
  <div>Cliente: ${escHtml(clienteRazonSocial)}</div>
  <div>${clienteTipoDoc === '6' ? 'RUC' : 'DNI'}: ${escHtml(clienteNumDoc)}</div>
  <div class="sep"></div>` : '';

    const hashSection = sunatHash ? `<div class="center" style="font-size:10px">Hash: ${escHtml(sunatHash)}</div>` : '';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(tipoDoc === '01' ? 'Factura' : 'Boleta')} ${escHtml(serie)}-${escHtml(correlativo)}</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * {
    margin: 0; padding: 0;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
  body {
    width: 80mm;
    padding: 5mm;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .sep {
    border-top: 1px dashed #000;
    margin: 4px 0;
  }
  .empresa { font-size: 14px; font-weight: bold; }
  .ruc { font-size: 11px; }
  .tipo-doc { font-size: 13px; font-weight: bold; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .item-name { width: 50%; }
  .item-qty { width: 10%; text-align: center; }
  .item-price { width: 20%; text-align: right; }
  .item-total { width: 20%; text-align: right; }
  .total-line { font-size: 14px; font-weight: bold; }
  .qr { text-align: center; margin-top: 4px; }
  .footer { font-size: 10px; text-align: center; margin-top: 6px; }
  @media print {
    body { width: 80mm; }
  }
</style>
</head>
<body>
  <div class="center empresa">${escHtml(empresa.nombre_comercial || empresa.razon_social || '')}</div>
  <div class="center ruc">RUC: ${escHtml(empresa.ruc || '')}</div>
  <div class="center" style="font-size:10px">${escHtml(config.direccion_fiscal || '')}</div>

  <div class="sep"></div>

  <div class="center tipo-doc">${tipoDoc === '01' ? 'FACTURA ELECTR\u00d3NICA' : 'BOLETA DE VENTA ELECTR\u00d3NICA'}</div>
  <div class="center bold">${escHtml(serie)}-${escHtml(correlativo)}</div>
  <div class="center" style="font-size:10px">Fecha: ${escHtml(fechaFormateada)}</div>

  <div class="sep"></div>

  ${clienteSection}

  <table>
    <tr style="font-size:10px; font-weight:bold">
      <td>Descripci\u00f3n</td>
      <td class="item-qty">Cant</td>
      <td class="item-price">P.Unit</td>
      <td class="item-total">Total</td>
    </tr>
  </table>
  <div class="sep"></div>
  <table>
    ${itemsHtml}
  </table>

  <div class="sep"></div>

  <table>
    <tr><td>Op. Gravadas</td><td class="right">S/ ${mtoOperGravadas}</td></tr>
    <tr><td>IGV</td><td class="right">S/ ${mtoIgv}</td></tr>
    <tr class="total-line"><td>TOTAL</td><td class="right">S/ ${mtoTotal}</td></tr>
  </table>

  <div class="sep"></div>

  ${hashSection}

  <div class="footer">
    Representaci\u00f3n impresa de la ${tipoDoc === '01' ? 'factura' : 'boleta'} electr\u00f3nica
  </div>
  <div class="footer">Gracias por su compra</div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Ticket error:', err);
    return res.status(500).send('Error generando ticket');
  }
});

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
