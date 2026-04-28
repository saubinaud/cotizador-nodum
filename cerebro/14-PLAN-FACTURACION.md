# Plan Maestro — Facturación Electrónica SUNAT

> Integración con APIsPeru (facturacion.apisperu.com)
> Modelo: Kudi como reseller (Opción B) — una cuenta master, múltiples empresas

---

## CONCEPTO

Kudi emite boletas y facturas electrónicas ante SUNAT en nombre de sus usuarios. El usuario no interactúa con APIsPeru directamente — Kudi maneja todo: certificados, series, envío, respuesta.

### Modelo de negocio

- **Feature de plan Pro** — solo usuarios con facturación activada por admin
- **Cuenta master de Kudi** en APIsPeru (premium, S/ 25/mes por empresa activa)
- Cada empresa del usuario se registra como `company` bajo la cuenta de Kudi
- El usuario sube su certificado digital (.p12) una sola vez
- Kudi almacena el certificado encriptado y firma automáticamente

### Costos

| Concepto | Costo | Quién paga |
|----------|-------|-----------|
| APIsPeru Premium | S/ 25/mes por empresa | Kudi (incluido en suscripción) |
| Certificado digital SUNAT (CDT) | S/ 0 (gratis desde SOL) | El usuario lo descarga |
| Certificado comercial (si supera límites) | S/ 295/año | El usuario |

---

## DATOS QUE YA TENEMOS

| Dato | Tabla actual | Campo |
|------|-------------|-------|
| RUC | usuarios | ruc |
| Razón social | usuarios | razon_social |
| Nombre comercial | usuarios | nombre_comercial |
| IGV rate | usuarios | igv_rate |
| Tipo negocio | usuarios | tipo_negocio |
| País | usuarios | pais_code |
| Productos | productos | nombre, precio_venta, precio_final |
| Ventas | ventas + transacciones | producto_id, cantidad, precio, descuento, total |

### Datos que FALTAN (hay que pedir)

| Dato | Para qué | Dónde agregarlo |
|------|----------|----------------|
| Dirección fiscal | Comprobante: dirección del emisor | usuarios (nuevo campo) |
| Departamento | Comprobante | usuarios |
| Provincia | Comprobante | usuarios |
| Distrito | Comprobante | usuarios |
| Ubigeo | Comprobante (código INEI) | usuarios |
| Certificado .p12 | Firmar comprobantes | facturacion_config (encriptado) |
| Contraseña del certificado | Desencriptar .p12 | facturacion_config (encriptado) |

---

## ARQUITECTURA DE BD

### Tablas nuevas

```sql
-- Configuración de facturación por empresa
CREATE TABLE IF NOT EXISTS facturacion_config (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  apisperu_company_id VARCHAR(100),      -- ID de la empresa en APIsPeru
  environment VARCHAR(20) DEFAULT 'beta', -- beta | produccion
  habilitado BOOLEAN DEFAULT false,       -- admin lo activa
  
  -- Certificado digital (encriptado)
  certificado_pem TEXT,                   -- PEM convertido (encriptado en app)
  certificado_subido BOOLEAN DEFAULT false,
  certificado_vence DATE,
  
  -- Series (auto-administradas)
  serie_factura VARCHAR(10) DEFAULT 'F001',
  serie_boleta VARCHAR(10) DEFAULT 'B001',
  serie_nota_credito VARCHAR(10) DEFAULT 'FC01',
  serie_nota_debito VARCHAR(10) DEFAULT 'FD01',
  correlativo_factura INTEGER DEFAULT 0,
  correlativo_boleta INTEGER DEFAULT 0,
  correlativo_nc INTEGER DEFAULT 0,
  correlativo_nd INTEGER DEFAULT 0,
  
  -- Dirección fiscal
  direccion_fiscal TEXT,
  departamento VARCHAR(50),
  provincia VARCHAR(50),
  distrito VARCHAR(50),
  ubigeo VARCHAR(10),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comprobantes emitidos
CREATE TABLE IF NOT EXISTS comprobantes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  venta_id INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
  transaccion_id INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  
  -- Datos del comprobante
  tipo_doc VARCHAR(5) NOT NULL,           -- 01=factura, 03=boleta, 07=NC, 08=ND
  serie VARCHAR(10) NOT NULL,
  correlativo VARCHAR(20) NOT NULL,
  fecha_emision TIMESTAMPTZ NOT NULL,
  
  -- Datos del cliente/comprador
  cliente_tipo_doc VARCHAR(5),            -- 1=DNI, 6=RUC, 0=sin doc
  cliente_num_doc VARCHAR(20),
  cliente_razon_social VARCHAR(200),
  cliente_direccion TEXT,
  
  -- Montos
  mto_oper_gravadas NUMERIC(12,2),
  mto_igv NUMERIC(12,2),
  mto_total NUMERIC(12,2),
  moneda VARCHAR(5) DEFAULT 'PEN',
  
  -- Respuesta SUNAT
  sunat_success BOOLEAN,
  sunat_code VARCHAR(20),
  sunat_message TEXT,
  sunat_xml TEXT,                          -- XML firmado (compacto)
  sunat_cdr TEXT,                          -- CDR de SUNAT
  sunat_hash VARCHAR(100),                -- Hash para QR
  
  -- Estado
  estado VARCHAR(20) DEFAULT 'emitido',   -- emitido | anulado | error
  
  -- Detalle (JSON con items del comprobante)
  detalle_json JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de clientes (compradores)
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_doc VARCHAR(5) NOT NULL DEFAULT '1', -- 1=DNI, 6=RUC, 0=sin doc
  num_doc VARCHAR(20) NOT NULL,
  razon_social VARCHAR(200),
  direccion TEXT,
  email VARCHAR(150),
  telefono VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, num_doc)
);
```

### Columnas nuevas en tablas existentes

```sql
-- usuarios: dirección fiscal
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS departamento VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS provincia VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS distrito VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10);

-- ventas: estado de facturación
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprobante_id INTEGER REFERENCES comprobantes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false;

-- transacciones: idem
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS comprobante_id INTEGER REFERENCES comprobantes(id);
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false;
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_comprobantes_usuario ON comprobantes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_venta ON comprobantes(venta_id);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_doc ON clientes(usuario_id, num_doc);
```

---

## SEGURIDAD — Datos sensibles

| Dato | Cómo protegerlo |
|------|-----------------|
| Certificado .p12 | Encriptar con AES-256 antes de guardar. La clave de encriptación va en env var, no en código |
| Contraseña del cert | No se guarda. Se usa una sola vez para convertir a PEM |
| RUC/DNI de clientes | Solo visible para el usuario dueño (filtro por usuario_id) |
| XML/CDR | No son sensibles per se, pero contienen datos fiscales. Solo accesibles por el dueño |

### Encriptación del certificado

```javascript
const crypto = require('crypto');
const CERT_KEY = process.env.FACTURACION_CERT_KEY; // 32 bytes hex en env var

function encryptCert(pem) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CERT_KEY, 'hex'), iv);
  let encrypted = cipher.update(pem, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCert(encrypted) {
  const [ivHex, data] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(CERT_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

---

## FLUJO DE EMISIÓN

### Al emitir boleta (venta < S/700, sin doc o con DNI)

```
1. Usuario registra venta en Kudi (ya existe)
2. Click "Emitir boleta"
3. Sistema auto-genera:
   - Serie: B001
   - Correlativo: auto-increment
   - Datos del emisor: desde facturacion_config + usuarios
   - Datos del comprador: sin doc (ventas < S/700) o DNI del catálogo
   - Detalle: producto, cantidad, precio, IGV
   - Totales: gravada, IGV, total
4. POST /invoice/send a APIsPeru
5. Si éxito:
   - Guarda XML + CDR en comprobantes
   - Marca venta como facturada
   - Incrementa correlativo
6. Si error:
   - Muestra mensaje de SUNAT
   - No marca como facturada
   - Usuario corrige y reintenta
```

### Al emitir factura (venta con RUC)

```
Igual que boleta pero:
- Serie: F001
- Requiere RUC + razón social del comprador (del catálogo de clientes)
- tipoDoc: '01' en vez de '03'
- cliente.tipoDoc: '6' (RUC) en vez de '1' (DNI)
```

### PDF bajo demanda

```
1. Usuario click "Ver PDF" en comprobante emitido
2. Kudi envía POST /invoice/pdf con los mismos datos
3. APIsPeru retorna el PDF
4. Se abre en nueva pestaña / descarga
5. NO se guarda — se regenera cada vez (zero storage)
```

---

## MAPEO KUDI → APISPERU

### Boleta de venta (tipoDoc: 03)

```javascript
{
  ublVersion: '2.1',
  tipoOperacion: '0101',
  tipoDoc: '03',
  serie: config.serie_boleta,
  correlativo: String(config.correlativo_boleta + 1),
  fechaEmision: new Date().toISOString(),
  tipoMoneda: 'PEN',
  
  formaPago: { moneda: 'PEN', tipo: 'Contado' },
  
  client: {
    tipoDoc: venta.total < 700 ? '0' : '1',  // sin doc o DNI
    numDoc: cliente?.num_doc || '00000000',
    rznSocial: cliente?.razon_social || 'VARIOS',
  },
  
  company: {
    ruc: parseInt(usuario.ruc),
    razonSocial: usuario.razon_social,
    nombreComercial: usuario.nombre_comercial,
    address: {
      direccion: config.direccion_fiscal,
      provincia: config.provincia,
      departamento: config.departamento,
      distrito: config.distrito,
      ubigueo: config.ubigeo,
    },
  },
  
  // Cálculos
  mtoOperGravadas: valorVenta,        // total sin IGV
  mtoIGV: montoIGV,                   // IGV
  totalImpuestos: montoIGV,
  valorVenta: valorVenta,
  subTotal: total,
  mtoImpVenta: total,                 // total con IGV
  
  details: [{
    codProducto: producto.id.toString(),
    unidad: 'NIU',                    // unidad (NIU = unidad)
    descripcion: producto.nombre,
    cantidad: venta.cantidad,
    mtoValorUnitario: precioSinIGV,   // precio sin IGV
    mtoValorVenta: valorVentaLinea,
    mtoBaseIgv: valorVentaLinea,
    porcentajeIgv: igvRate * 100,     // 18
    igv: igvLinea,
    tipAfeIgv: '10',                  // gravado
    totalImpuestos: igvLinea,
    mtoPrecioUnitario: precioConIGV,  // precio con IGV
  }],
  
  legends: [{
    code: '1000',
    value: montoEnLetras(total),       // "CIENTO VEINTE CON 00/100 SOLES"
  }],
}
```

---

## FASES DE IMPLEMENTACIÓN

### FASE 1: BD + Configuración (backend)
- Tablas: facturacion_config, comprobantes, clientes
- Columnas: dirección fiscal en usuarios, facturado en ventas/transacciones
- Encriptación de certificados (AES-256)
- Env var: FACTURACION_CERT_KEY, APISPERU_TOKEN
- Endpoint: PUT /api/facturacion/config (admin sube cert, configura datos)

### FASE 2: Catálogo de clientes
- CRUD /api/clientes (solo visible por usuario_id)
- Búsqueda por DNI/RUC con auto-completado desde APIs.net.pe
- UI: página simple con tabla + formulario

### FASE 3: Motor de emisión (backend)
- routes/facturacion.js:
  - POST /api/facturacion/emitir — genera JSON, envía a APIsPeru, guarda respuesta
  - GET /api/facturacion/pdf/:id — regenera PDF bajo demanda
  - GET /api/facturacion/comprobantes?periodo_id=X — historial
  - POST /api/facturacion/anular/:id — nota de crédito
- Auto-incremento de correlativos
- Conversión monto → letras
- Cálculo automático de base gravada, IGV, totales

### FASE 4: UI de emisión
- Botón "Emitir" en ventas (PLVentasPage) y timeline (PLTimelinePage)
- Modal: seleccionar boleta/factura, seleccionar cliente (del catálogo), confirmar
- Indicador visual "Facturado ✓" en cada venta
- Descarga/preview de PDF

### FASE 5: Dashboard de comprobantes
- Nueva página: historial de todos los comprobantes emitidos
- Filtros: tipo, fecha, estado
- Botones: ver PDF, anular, reenviar por email
- Resumen: total facturado, total boletas, total por mes

### FASE 6: Email de comprobante (opcional)
- Al emitir, enviar automáticamente por email al cliente
- Usar Notifuse (ya está en el VPS) o SMTP directo
- Adjuntar PDF regenerado

---

## DEPENDENCIAS

```
FASE 1 → FASE 2 → FASE 3 → FASE 4
                            FASE 3 → FASE 5
                            FASE 5 → FASE 6
```

**Paralelo posible:** FASE 2 + FASE 1 (clientes + config)

---

## SIDEBAR

```
P&L
  Timeline
  Ventas
  Compras
  Gastos
  Estado de resultados
  Flujo de Caja
Facturación  ← NUEVA SECCIÓN
  Emitir
  Comprobantes
  Clientes
```

---

## IMPACTO EN CÓDIGO

| Archivo | Cambio |
|---------|--------|
| `server/src/models/migrate.js` | 3 tablas + columnas + indexes |
| `server/src/routes/facturacion.js` | NUEVO — emisión, PDF, historial, anulación |
| `server/src/routes/clientes.js` | NUEVO — CRUD clientes |
| `server/src/utils/facturacion.js` | NUEVO — builder JSON, monto en letras, encriptación |
| `server/src/app.js` | Registrar rutas |
| `client/src/pages/FacturacionPage.jsx` | NUEVO — config + emisión |
| `client/src/pages/ComprobantesPage.jsx` | NUEVO — historial |
| `client/src/pages/ClientesPage.jsx` | NUEVO — catálogo |
| `client/src/pages/PLVentasPage.jsx` | Botón emitir + indicador |
| `client/src/pages/PLTimelinePage.jsx` | Botón emitir + indicador |
| `client/src/components/Layout.jsx` | Sección Facturación en sidebar |
| `client/src/App.jsx` | Rutas nuevas |

### NO se modifica:
- Cotizador, insumos, materiales, preparaciones
- P&L resumen, gastos, compras
- Flujo de caja, arqueo
- Sistema de temas, auth base

---

## ENV VARS NUEVAS

```env
APISPERU_TOKEN=token_de_la_cuenta_master_de_kudi
APISPERU_BASE_URL=https://facturacion.apisperu.com/api/v1
FACTURACION_CERT_KEY=clave_hex_32_bytes_para_aes256
```
