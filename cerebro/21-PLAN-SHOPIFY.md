# Plan: Integración Shopify — Kudi como Orquestador

> Creado: 6 mayo 2026
> Kudi es el master del stock. Shopify es un canal de venta.

---

## Concepto

Kudi orquesta todo el inventario. Shopify es solo otro punto de venta (como la tienda física, Rappi, PedidosYa). El stock real vive en Kudi.

## Setup del usuario (1 sola vez)

1. Va a Shopify Admin → Settings → Apps → Develop apps → Create app
2. Configura scopes: `read_products, write_products, read_orders, write_inventory_levels, read_locations`
3. Install app → copia el Access Token (`shpat_xxxxx`)
4. En Kudi → Integraciones → Shopify:
   - Pega Store URL: `mitienda.myshopify.com`
   - Pega Access Token: `shpat_xxxxx`
   - Click "Conectar" → Kudi valida la conexión
   - Status: ✅ Conectado — 45 productos encontrados

## 4 Flujos de sincronización

### Flujo 1: Sync productos (Shopify → Kudi)
**Trigger:** Botón "Importar productos" o "Sincronizar"
**Lógica:**
1. Kudi llama GraphQL `{ products(first: 250) { id, title, variants { sku, price, inventoryQuantity } } }`
2. Para cada producto de Shopify:
   - Buscar en Kudi por SKU (`productos.sku = variant.sku`)
   - Si existe: actualizar `shopify_product_id`, `shopify_variant_id`
   - Si no existe: crear producto en Kudi con datos de Shopify
3. Mostrar resumen: X vinculados, Y nuevos, Z sin SKU

### Flujo 2: Venta en Shopify → registrar en Kudi
**Trigger:** Polling cada 5 min o webhook `orders/create`
**Lógica:**
1. Kudi consulta `{ orders(first: 50, query: "created_at:>'2026-05-06'") { ... } }`
2. Para cada orden nueva (no procesada):
   - Buscar productos por SKU en Kudi
   - Crear venta en Kudi (venta_items con cada línea del pedido)
   - Descontar stock en Kudi (registrarMovimiento)
   - Marcar orden como procesada (guardar shopify_order_id)
3. **NO push stock a Shopify** — ya se descontó allá por la venta online

### Flujo 3: Venta en Kudi (tienda física) → actualizar Shopify
**Trigger:** Después de cada venta en Kudi
**Lógica:**
1. Al registrar venta en Kudi, stock se descuenta localmente
2. Para cada item vendido que tiene `shopify_variant_id`:
   - Llamar `inventoryAdjustQuantities` mutation en Shopify
   - Descontar la misma cantidad en Shopify
3. Si falla la API de Shopify → log error, no bloquear la venta

### Flujo 4: Push stock completo (Kudi → Shopify)
**Trigger:** Botón "Sincronizar stock" o después de ajuste manual
**Lógica:**
1. Para cada producto con `shopify_variant_id` y `control_stock=true`:
   - Leer stock actual de Kudi
   - Llamar `inventorySetOnHandQuantities` en Shopify
   - Setear stock = stock_actual de Kudi (override total)
2. Esto es el "hard sync" — Kudi impone su verdad

---

## Tablas

```sql
-- Ya existe, agregar:
ALTER TABLE productos ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT;

CREATE TABLE integraciones (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo VARCHAR(20) NOT NULL DEFAULT 'shopify',
  store_url VARCHAR(200),
  access_token TEXT, -- encriptado
  location_id BIGINT, -- Shopify location for inventory
  activo BOOLEAN DEFAULT true,
  ultima_sync TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tipo VARCHAR(30), -- 'pull_orders', 'push_stock', 'sync_products'
  estado VARCHAR(20), -- 'ok', 'error', 'parcial'
  detalle JSONB, -- { procesados: 5, errores: 1, nuevos: 2 }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Para no duplicar órdenes
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS shopify_order_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_shopify_order ON ventas(empresa_id, shopify_order_id) WHERE shopify_order_id IS NOT NULL;
```

---

## Endpoints

### Config
- `GET /api/shopify/status` — estado de conexión + stats
- `POST /api/shopify/connect` — validar token + guardar config
- `DELETE /api/shopify/disconnect` — desconectar

### Sync
- `POST /api/shopify/sync-products` — importar/vincular productos
- `POST /api/shopify/pull-orders` — jalar órdenes nuevas → registrar ventas
- `POST /api/shopify/push-stock` — push stock completo a Shopify
- `GET /api/shopify/logs` — historial de sincronizaciones

### Auto (interno)
- En POST /ventas: si producto tiene shopify_variant_id → auto-push stock
- Cron/interval: cada 5 min pull orders nuevas (si auto-sync ON)

---

## Frontend — ShopifyPage.jsx

```
┌─────────────────────────────────────────────────────┐
│ Shopify                              [Desconectar]  │
├─────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────┐   │
│ │ ✅ Conectado a mitienda.myshopify.com         │   │
│ │ 45 productos · 12 vinculados · Última sync: 5m│   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ [Sync Productos]  [Pull Órdenes]  [Push Stock]      │
│                                                     │
│ Auto-sync: [ON/OFF]  Intervalo: [5 min]             │
│                                                     │
│ ── Productos vinculados ──────────────────────────  │
│ Producto Kudi          SKU      Shopify Product     │
│ Anillo oro             AO-01    ✅ Vinculado        │
│ Collar plata           CP-02    ✅ Vinculado        │
│ Pulsera custom         PU-03    ⚠️ Sin SKU match   │
│                                                     │
│ ── Últimas sincronizaciones ─────────────────────── │
│ 14:30 Pull órdenes — 3 nuevas, 0 errores           │
│ 14:25 Push stock — 12 actualizados                  │
│ 14:00 Pull órdenes — 0 nuevas                       │
└─────────────────────────────────────────────────────┘
```

### Setup (primera vez)
```
┌─────────────────────────────────────────────────────┐
│ Conectar Shopify                                     │
│                                                     │
│ 1. Ve a tu Shopify Admin → Settings → Apps           │
│ 2. Click "Develop apps" → "Create an app"            │
│ 3. En API scopes, activa:                            │
│    ☑ read_products  ☑ write_products                 │
│    ☑ read_orders    ☑ write_inventory_levels          │
│    ☑ read_locations                                  │
│ 4. Install app → copia el Access Token               │
│                                                     │
│ Store URL: [____________.myshopify.com]              │
│ Access Token: [shpat_________________________]       │
│                                                     │
│ [Conectar]                                           │
└─────────────────────────────────────────────────────┘
```

---

## Shopify GraphQL Queries

### Products
```graphql
{
  products(first: 250) {
    edges {
      node {
        id
        title
        images(first: 1) { edges { node { url } } }
        variants(first: 10) {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              inventoryItem { id }
            }
          }
        }
      }
    }
  }
}
```

### Orders (nuevas)
```graphql
{
  orders(first: 50, query: "created_at:>'${lastSync}'", sortKey: CREATED_AT) {
    edges {
      node {
        id
        name
        createdAt
        totalPriceSet { shopMoney { amount } }
        lineItems(first: 50) {
          edges {
            node {
              sku
              quantity
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
        }
        customer { firstName lastName email }
      }
    }
  }
}
```

### Inventory Adjust (descontar)
```graphql
mutation {
  inventoryAdjustQuantities(input: {
    reason: "correction"
    name: "available"
    changes: [{
      delta: -2
      inventoryItemId: "gid://shopify/InventoryItem/XXX"
      locationId: "gid://shopify/Location/XXX"
    }]
  }) {
    inventoryAdjustmentGroup { reason }
    userErrors { message }
  }
}
```

### Inventory Set (override total)
```graphql
mutation {
  inventorySetOnHandQuantities(input: {
    reason: "correction"
    setQuantities: [{
      inventoryItemId: "gid://shopify/InventoryItem/XXX"
      locationId: "gid://shopify/Location/XXX"
      quantity: 15
    }]
  }) {
    inventoryAdjustmentGroup { reason }
    userErrors { message }
  }
}
```

---

## Manejo de conflictos

### Venta simultánea (tienda física + online)
- **Kudi es master** — si stock en Kudi = 0, Shopify se actualiza a 0
- La venta online que llegó después se registra en Kudi con stock negativo (alerta)
- El usuario resuelve manualmente (cancelar orden Shopify o ajustar stock)

### Producto sin SKU
- Se marca como "⚠️ Sin SKU match" — no se sincroniza
- El usuario debe asignar SKU en Kudi o en Shopify

### API rate limiting
- Shopify permite 50 requests/segundo (GraphQL)
- Sync en batch de 250 productos por query
- Pull orders con cursor pagination

---

## Implementación: 2 sesiones

### Sesión 1: Config + Sync productos + Pull órdenes
- integraciones table + shopify columns
- POST /shopify/connect (validar token)
- POST /shopify/sync-products (importar/vincular por SKU)
- POST /shopify/pull-orders (jalar → crear ventas)
- ShopifyPage.jsx (setup + sync buttons)

### Sesión 2: Push stock + Auto-sync + Polish
- POST /shopify/push-stock (override completo)
- Auto-push en POST /ventas (descontar en Shopify)
- Auto-pull con intervalo configurable
- Logs de sincronización
- Manejo de errores robusto
