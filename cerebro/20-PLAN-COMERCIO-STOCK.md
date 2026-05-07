# Plan: Módulos de Comercio — Stock, Comisiones, Compras, Proveedores, Shopify

> Creado: 6 mayo 2026
> Objetivo: Hacer Kudi funcional para negocios que compran y revenden (joyerías, importadores, retail)
> Referencia: `.claude/projects/.../project_kudi_roadmap_comercio.md`

---

## Fase 1: Stock de productos (1 sesión)

### Objetivo
Cada producto tiene inventario. Al vender descuenta, al comprar suma. Alerta de stock bajo.

### BD
```sql
-- Stock actual por producto (1 row per product)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_actual NUMERIC(10,2) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(10,2) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS control_stock BOOLEAN DEFAULT false;

-- Historial de movimientos
CREATE TABLE stock_movimientos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo VARCHAR(20) NOT NULL, -- 'entrada', 'salida', 'ajuste'
  cantidad NUMERIC(10,2) NOT NULL,
  stock_anterior NUMERIC(10,2),
  stock_nuevo NUMERIC(10,2),
  referencia_tipo VARCHAR(20), -- 'venta', 'compra', 'ajuste_manual', 'shopify'
  referencia_id INTEGER,
  nota TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend
- `server/src/routes/stock.js` — NUEVO
  - `GET /stock` — listar productos con stock + alertas
  - `POST /stock/ajuste` — ajuste manual (inventario físico)
  - `GET /stock/movimientos?producto_id=X` — historial
- Modificar `pl.js` POST /ventas — si `control_stock=true`, descontar stock automáticamente
- Modificar compras — si producto tiene control_stock, sumar al stock

### Frontend
- `client/src/pages/StockPage.jsx` — NUEVO
  - Tabla de productos con stock actual, mínimo, alerta (rojo si bajo)
  - Botón ajuste manual
  - Historial de movimientos por producto
- Agregar al menú: Catálogo → Inventario
- En CotizadorPage: toggle "Control de stock" + campos stock inicial/mínimo

### Estimación: ~100 queries, 2 archivos nuevos, 3 modificados

---

## Fase 2: Comisiones de vendedores (0.5 sesión)

### Objetivo
Cada vendedor tiene un % de comisión. Al registrar venta, se calcula y registra automáticamente. La comisión es un COSTO que se descuenta de la ganancia.

### BD
```sql
-- Comisión por vendedor
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_pct NUMERIC(5,2) DEFAULT 0;

-- Registro de comisiones
CREATE TABLE comisiones (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
  vendedor_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto_venta NUMERIC(12,2) NOT NULL,
  costo_envio NUMERIC(12,2) DEFAULT 0,
  base_comision NUMERIC(12,2) NOT NULL, -- monto_venta - costo_envio
  comision_pct NUMERIC(5,2) NOT NULL,
  comision_monto NUMERIC(12,2) NOT NULL,
  fecha DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend
- Modificar `pl.js` POST /ventas — si hay vendedor_id con comision_pct > 0, crear registro en comisiones
- `GET /comisiones?year=X&month=Y` — resumen por vendedor
- `GET /comisiones/vendedor/:id` — detalle de comisiones de un vendedor

### Frontend
- En PLVentasPage: campo vendedor (solo si empresa tiene vendedores)
- Nueva sección en Finanzas o Ventas: "Comisiones" con resumen mensual por vendedor
- En EquipoPage: campo comision_pct por vendedor
- En Rentabilidad: incluir comisión como costo del producto

### Estimación: ~30 queries, 1 archivo nuevo, 4 modificados

---

## Fase 3: Compras de productos terminados (1 sesión)

### Objetivo
Para negocios que no producen: registrar la compra de productos terminados (no insumos). El costo del producto = precio de compra.

### BD
```sql
-- Reutilizar compras + compra_items existentes
-- Agregar soporte para producto_id en compra_items
ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES productos(id);

-- Proveedores
CREATE TABLE proveedores (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre VARCHAR(200) NOT NULL,
  ruc VARCHAR(20),
  contacto VARCHAR(200),
  email VARCHAR(150),
  telefono VARCHAR(50),
  direccion TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE compras ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id);
```

### Backend
- `server/src/routes/proveedores.js` — NUEVO: CRUD proveedores
- Modificar `pl.js` compras: aceptar producto_id en items, actualizar costo_neto del producto
- Al registrar compra de producto: crear stock_movimiento tipo='entrada'
- Método de costeo: último precio o promedio ponderado (WAC) según config empresa

### Frontend
- `client/src/pages/ProveedoresPage.jsx` — NUEVO: catálogo de proveedores
- Modificar PLComprasPage: agregar selector de proveedor + opción de comprar productos (no solo insumos)
- En CotizadorPage para revendedores: mostrar "Precio de compra" en vez de "Costo de insumos"

### Estimación: ~60 queries, 2 archivos nuevos, 3 modificados

---

## Fase 4: Órdenes de compra (1-2 sesiones)

### Objetivo
Generar órdenes de compra formales para proveedores. Flujo: borrador → enviada → recibida.

### BD
```sql
CREATE TABLE ordenes_compra (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  numero VARCHAR(20), -- auto-generated: OC-001, OC-002
  fecha DATE NOT NULL,
  fecha_entrega_estimada DATE,
  estado VARCHAR(20) DEFAULT 'borrador', -- borrador, enviada, recibida, cancelada
  moneda VARCHAR(5) DEFAULT 'PEN',
  tipo_cambio NUMERIC(8,4) DEFAULT 1, -- para compras en USD
  subtotal NUMERIC(12,2),
  igv NUMERIC(12,2),
  total NUMERIC(12,2),
  costos_adicionales NUMERIC(12,2) DEFAULT 0, -- flete, aduana, etc.
  notas TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orden_compra_items (
  id SERIAL PRIMARY KEY,
  orden_compra_id INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  insumo_id INTEGER REFERENCES insumos(id),
  material_id INTEGER REFERENCES materiales(id),
  descripcion TEXT,
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario NUMERIC(12,4) NOT NULL,
  subtotal NUMERIC(12,4)
);
```

### Backend
- `server/src/routes/ordenes-compra.js` — NUEVO
  - CRUD completo
  - Cambio de estado: borrador → enviada → recibida
  - Al marcar "recibida": auto-crear compra + actualizar stock
  - Generador de PDF de orden de compra

### Frontend
- `client/src/pages/OrdenesCompraPage.jsx` — NUEVO
  - Lista de órdenes con estados (badges)
  - Formulario: seleccionar proveedor, agregar items, moneda, tipo de cambio
  - Botón "Marcar como recibida" → flujo de recepción
  - Botón "Descargar PDF" / "Enviar por email"
- Agregar al menú: Inventario → Órdenes de compra

### Para joyerías importadoras
- Campo moneda USD + tipo de cambio
- Costos adicionales: flete, aduana, seguro
- El costo real del producto = (precio_unitario * tipo_cambio) + (costos_adicionales / cantidad)

### Estimación: ~80 queries, 2 archivos nuevos, 2 modificados

---

## Fase 5: Integración Shopify (2-3 sesiones)

### Objetivo
Sincronización bidireccional: ventas de Shopify → Kudi, stock de Kudi → Shopify.

### Prerequisitos
- Stock implementado (Fase 1)
- Productos con SKU para matching

### BD
```sql
CREATE TABLE integraciones (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo VARCHAR(20) NOT NULL, -- 'shopify'
  config JSONB NOT NULL, -- { store_url, access_token, webhook_secret }
  activo BOOLEAN DEFAULT true,
  ultima_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT;
```

### Backend
- `server/src/routes/shopify.js` — NUEVO
  - `POST /shopify/connect` — OAuth flow con Shopify
  - `POST /shopify/sync-products` — importar productos de Shopify
  - `POST /shopify/sync-orders` — jalar órdenes recientes
  - `POST /shopify/webhook/order-created` — webhook para ventas en tiempo real
  - `PUT /shopify/push-stock` — actualizar inventario en Shopify
- Cron job: sync cada 15 minutos (órdenes nuevas + stock)

### Frontend
- `client/src/pages/ShopifyPage.jsx` — NUEVO
  - Conectar tienda (ingresar store URL)
  - Mapear productos Kudi ↔ Shopify
  - Dashboard de sync: última sincronización, errores, productos mapeados
  - Toggle: sync automático on/off

### Complejidad
- Shopify Admin API: REST + GraphQL
- OAuth 2.0 para acceso
- Webhooks para tiempo real
- Manejo de conflictos de stock (venta simultánea en tienda física + online)
- Rate limiting de Shopify API

### Estimación: ~150 queries, 3 archivos nuevos, 5 modificados

---

## Fase 6: Acceso proveedores (0.5 sesión)

### Objetivo
Un proveedor puede ver sus órdenes de compra via un link único (sin login completo).

### Implementación
- Token de acceso por proveedor (como onboarding_token)
- Vista pública: lista de órdenes de compra del proveedor con estados
- Sin edición — solo lectura

### Estimación: 1 archivo nuevo, 1 modificado

---

## Resumen de ejecución

| Fase | Feature | Sesiones | Dependencia |
|------|---------|----------|-------------|
| 1 | Stock | 1 | — |
| 2 | Comisiones | 0.5 | — |
| 3 | Compras productos + Proveedores | 1 | Stock |
| 4 | Órdenes de compra | 1.5 | Proveedores |
| 5 | Shopify | 2.5 | Stock |
| 6 | Acceso proveedores | 0.5 | Proveedores |
| **Total** | | **~7 sesiones** | |

## Nuevo menú propuesto

```
📦 Catálogo
  ├── Productos
  ├── Nuevo producto
  ├── Ingredientes
  ├── Materiales
  ├── Recetas base
  ├── Empaques predet.
  ├── Canales y Envío
  └── Rentabilidad

📊 Inventario (NUEVO)
  ├── Stock
  ├── Proveedores
  └── Órdenes de compra

💰 Ventas
  ├── Registro
  ├── Contra Entrega
  ├── Comisiones (NUEVO)
  └── Proyección

📊 Finanzas
  ├── Timeline
  ├── Estado de resultados
  ├── Compras
  ├── Gastos
  ├── Flujo de Caja
  └── Pérdidas / Mermas

🧾 Facturación
  ├── Comprobantes
  └── Clientes

🔗 Integraciones (NUEVO)
  └── Shopify
```
