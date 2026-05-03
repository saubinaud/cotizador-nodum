# Facturación Electrónica SUNAT — Módulo Standalone

> Extraído de Kudi. Licencia: uso interno Nodum Studio.
> Última actualización: 3 mayo 2026

Sistema completo de facturación electrónica para Perú (SUNAT) usando Lycet/Greenter self-hosted. Costo: S/ 0/mes.

## Arquitectura

```
[Tu App] → [Este módulo (Express.js)] → [Lycet (Docker/PHP)] → [SUNAT]
```

## Requisitos

- Node.js 20+
- PostgreSQL 16+
- Docker (para Lycet)
- Certificado digital .p12 de SUNAT/RENIEC

## Setup rápido

### 1. Lycet (Greenter)

```bash
git clone https://github.com/giansalex/lycet /opt/lycet
cd /opt/lycet
docker build -t lycet .

# Convertir tu .p12 a PEM
openssl pkcs12 -in certificado.p12 -out /opt/lycet/data/cert.pem -nodes -legacy

# Configurar .env
cat > /opt/lycet/.env << 'EOF'
CLIENT_TOKEN=tu-token-seguro
SOL_USER={RUC}{USUARIO_SOL_SECUNDARIO}
SOL_PASS=tu-clave-sol
FE_URL=https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
RE_URL=https://e-factura.sunat.gob.pe/ol-ti-itemision-otroscpe-gem/billService
GUIA_URL=https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService
EOF

# Logo placeholder
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -d > /opt/lycet/data/logo.png

# Levantar
docker run -d -p 0.0.0.0:8050:8000 -v /opt/lycet/data:/var/www/html/data --env-file /opt/lycet/.env --name lycet_app --restart unless-stopped lycet
```

### 2. Base de datos

Tablas necesarias (crear en tu PostgreSQL):

```sql
CREATE TABLE facturacion_config (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE,
  empresa_id INTEGER,
  habilitado BOOLEAN DEFAULT false,
  certificado_pem TEXT,
  certificado_subido BOOLEAN DEFAULT false,
  serie_factura VARCHAR(10) DEFAULT 'F001',
  serie_boleta VARCHAR(10) DEFAULT 'B001',
  correlativo_factura INTEGER DEFAULT 0,
  correlativo_boleta INTEGER DEFAULT 0,
  direccion_fiscal TEXT,
  departamento VARCHAR(50),
  provincia VARCHAR(50),
  distrito VARCHAR(50),
  ubigeo VARCHAR(10),
  sol_user VARCHAR(20),
  sol_pass VARCHAR(50),
  environment VARCHAR(20) DEFAULT 'produccion',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comprobantes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER,
  venta_id INTEGER,
  tipo_doc VARCHAR(5) NOT NULL,
  serie VARCHAR(10) NOT NULL,
  correlativo VARCHAR(20) NOT NULL,
  fecha_emision TIMESTAMPTZ NOT NULL,
  cliente_tipo_doc VARCHAR(5),
  cliente_num_doc VARCHAR(20),
  cliente_razon_social VARCHAR(200),
  cliente_direccion TEXT,
  mto_oper_gravadas NUMERIC(12,2),
  mto_igv NUMERIC(12,2),
  mto_total NUMERIC(12,2),
  moneda VARCHAR(5) DEFAULT 'PEN',
  sunat_success BOOLEAN,
  sunat_code VARCHAR(20),
  sunat_message TEXT,
  sunat_xml TEXT,
  sunat_cdr TEXT,
  sunat_hash VARCHAR(100),
  estado VARCHAR(20) DEFAULT 'emitido',
  detalle_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER,
  tipo_doc VARCHAR(5) DEFAULT '1',
  num_doc VARCHAR(20) NOT NULL,
  razon_social VARCHAR(200),
  direccion TEXT,
  email VARCHAR(150),
  telefono VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, num_doc)
);
```

### 3. Variables de entorno

```env
LYCET_URL=http://localhost:8050/api/v1
LYCET_TOKEN=tu-token-seguro
FACTURACION_CERT_KEY=genera-con-openssl-rand-hex-32
```

### 4. Integrar en tu Express app

```js
const facturacionRoutes = require('./routes/facturacion');
const clientesRoutes = require('./routes/clientes');

app.use('/api/facturacion', facturacionRoutes);
app.use('/api/clientes', clientesRoutes);
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/facturacion/config | Config de facturación |
| PUT | /api/facturacion/config | Actualizar config (SOL, dirección) |
| POST | /api/facturacion/certificado | Subir .p12 |
| POST | /api/facturacion/emitir | Emitir boleta/factura |
| GET | /api/facturacion/pdf/:id | Generar PDF |
| GET | /api/facturacion/comprobantes | Listar comprobantes |
| POST | /api/facturacion/anular/:id | Anular comprobante |
| POST | /api/facturacion/validar-sol | Validar credenciales SOL |
| DELETE | /api/facturacion/comprobantes/rechazados | Limpiar rechazados |
| GET | /api/facturacion/buscar-ruc/:ruc | Buscar RUC en SUNAT |

## Emitir una boleta

```js
POST /api/facturacion/emitir
{
  "tipo": "boleta",
  "items": [{
    "producto_id": "1",
    "producto_nombre": "Galleta Artesanal",
    "cantidad": 2,
    "precio_unitario": 15,
    "descuento": 0
  }]
}
```

## Multi-empresa

Lycet soporta múltiples empresas. La función `syncLycetCompany()` registra automáticamente cada empresa con su certificado y credenciales SOL via `PUT /configuration/company/{ruc}`.

## Notas importantes

- **Timezone**: Fechas de emisión en hora Lima (UTC-5)
- **IGV**: 18% general o 10.5% restaurantes — configurable por usuario
- **SOL User**: Formato `{RUC}{USUARIO_SECUNDARIO}` (requiere usuario secundario SUNAT)
- **Certificado**: .p12 de RENIEC/SUNAT, se convierte a PEM con openssl -legacy
- **PDF**: Lycet devuelve application/pdf binario, el módulo convierte a base64
