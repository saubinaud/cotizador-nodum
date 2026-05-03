const crypto = require('crypto');

const CERT_KEY = process.env.FACTURACION_CERT_KEY || 'dev_key_32_bytes_placeholder_000';

// ==================== ENCRYPTION ====================

function encryptCert(pem) {
  const key = Buffer.from(CERT_KEY, 'hex').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(pem, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCert(encrypted) {
  const key = Buffer.from(CERT_KEY, 'hex').slice(0, 32);
  const [ivHex, data] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ==================== MONTO EN LETRAS ====================

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function convertirGrupo(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  let resultado = '';
  const centena = Math.floor(n / 100);
  const resto = n % 100;

  if (centena > 0) resultado += CENTENAS[centena] + ' ';

  if (resto >= 10 && resto <= 15) {
    resultado += ESPECIALES[resto - 10];
  } else if (resto >= 16 && resto <= 19) {
    resultado += 'DIECI' + UNIDADES[resto - 10];
  } else if (resto >= 21 && resto <= 29) {
    resultado += 'VEINTI' + UNIDADES[resto - 20];
  } else {
    const decena = Math.floor(resto / 10);
    const unidad = resto % 10;
    if (decena > 0) resultado += DECENAS[decena];
    if (unidad > 0) resultado += (decena > 0 ? ' Y ' : '') + UNIDADES[unidad];
  }

  return resultado.trim();
}

function montoEnLetras(monto, moneda = 'SOLES') {
  if (monto === 0) return 'CERO CON 00/100 ' + moneda;

  const entero = Math.floor(Math.abs(monto));
  const centavos = Math.round((Math.abs(monto) - entero) * 100);

  let resultado = '';

  if (entero === 0) {
    resultado = 'CERO';
  } else if (entero === 1) {
    resultado = 'UNO';
  } else {
    const millones = Math.floor(entero / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const unidades = entero % 1000;

    if (millones > 0) {
      resultado += (millones === 1 ? 'UN MILLON' : convertirGrupo(millones) + ' MILLONES') + ' ';
    }
    if (miles > 0) {
      resultado += (miles === 1 ? 'MIL' : convertirGrupo(miles) + ' MIL') + ' ';
    }
    if (unidades > 0) {
      resultado += convertirGrupo(unidades);
    }
  }

  return resultado.trim() + ' CON ' + String(centavos).padStart(2, '0') + '/100 ' + moneda;
}

// ==================== INVOICE BUILDER ====================

function buildInvoiceJSON({ tipo, venta, productos, usuario, config, cliente }) {
  const tipoDoc = tipo === 'factura' ? '01' : '03';
  const serie = tipo === 'factura' ? config.serie_factura : config.serie_boleta;
  const correlativo = tipo === 'factura'
    ? String(config.correlativo_factura + 1)
    : String(config.correlativo_boleta + 1);

  // Use the user's IGV rate (18% standard, 10.5% for restaurants/restauración)
  const igvRate = parseFloat(usuario.igv_rate) || 0.18;
  const igvPct = round2(igvRate * 100);

  // Build details from venta items
  const items = Array.isArray(productos) ? productos : [productos];
  const details = items.map(item => {
    const cantidad = parseFloat(item.cantidad) || 1;
    const precioConIGV = parseFloat(item.precio_unitario) || 0;
    const precioSinIGV = precioConIGV / (1 + igvRate);
    const valorVentaLinea = precioSinIGV * cantidad;
    const igvLinea = valorVentaLinea * igvRate;

    return {
      codProducto: String(item.producto_id || item.id || ''),
      unidad: 'NIU',
      descripcion: item.producto_nombre || item.nombre || 'Producto',
      cantidad,
      mtoValorUnitario: round2(precioSinIGV),
      mtoValorVenta: round2(valorVentaLinea),
      mtoBaseIgv: round2(valorVentaLinea),
      porcentajeIgv: igvPct,
      igv: round2(igvLinea),
      tipAfeIgv: 10, // Gravado (number, not string)
      totalImpuestos: round2(igvLinea),
      mtoPrecioUnitario: round2(precioConIGV),
    };
  });

  const totalValorVenta = details.reduce((s, d) => s + d.mtoValorVenta, 0);
  const totalIGV = details.reduce((s, d) => s + d.igv, 0);
  const totalVenta = totalValorVenta + totalIGV;

  // Handle discounts
  const descuento = parseFloat(venta.descuento) || 0;
  const totalFinal = totalVenta - descuento;

  const invoice = {
    ublVersion: '2.1',
    tipoOperacion: '0101',
    tipoDoc,
    serie,
    correlativo,
    fechaEmision: (() => {
      // Peru is UTC-5 — convert UTC to Lima time
      const now = new Date();
      const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      return lima.toISOString().replace(/\.\d{3}Z$/, '-05:00');
    })(),
    tipoMoneda: 'PEN',

    formaPago: { moneda: 'PEN', tipo: 'Contado' },

    client: {
      tipoDoc: cliente?.tipo_doc || '0',
      numDoc: cliente?.num_doc || '00000000',
      rznSocial: cliente?.razon_social || 'VARIOS',
      address: cliente?.direccion ? { direccion: cliente.direccion } : undefined,
    },

    company: {
      ruc: parseInt(usuario.ruc),
      razonSocial: usuario.razon_social,
      nombreComercial: usuario.nombre_comercial || usuario.empresa,
      address: {
        direccion: config.direccion_fiscal || '',
        provincia: config.provincia || '',
        departamento: config.departamento || '',
        distrito: config.distrito || '',
        ubigueo: config.ubigeo || '',
      },
    },

    mtoOperGravadas: round2(totalValorVenta),
    mtoIGV: round2(totalIGV),
    totalImpuestos: round2(totalIGV),
    valorVenta: round2(totalValorVenta),
    subTotal: round2(totalFinal),
    mtoImpVenta: round2(totalFinal),

    details,

    legends: [{
      code: '1000',
      value: montoEnLetras(totalFinal),
    }],
  };

  // Add discounts if applicable
  if (descuento > 0) {
    invoice.descuentos = [{
      codTipo: '02',
      factor: round2(descuento / totalVenta),
      monto: round2(descuento),
      montoBase: round2(totalVenta),
    }];
  }

  return { invoice, serie, correlativo, totalValorVenta: round2(totalValorVenta), totalIGV: round2(totalIGV), totalFinal: round2(totalFinal) };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  encryptCert,
  decryptCert,
  montoEnLetras,
  buildInvoiceJSON,
  round2,
};
