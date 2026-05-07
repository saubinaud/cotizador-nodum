# Plan: Shopify Auth Directo — Extraer API token sin CLI

> Creado: 6 mayo 2026
> Objetivo: Obtener un access token de Shopify sin crear una app con CLI

---

## El problema

Shopify 2026 ya no da tokens `shpat_` directamente. El `atkn_` requiere OAuth. Pero NO queremos crear una Shopify App con el CLI — queremos que desde Kudi el usuario se conecte y obtengamos el token automáticamente.

## La solución: OAuth flow embebido en Kudi

Shopify sigue soportando **Custom Apps con OAuth** — solo que ahora se crean desde el Partner Dashboard en vez del admin de la tienda. El flujo:

### Paso 1: Registrar Kudi como Shopify App (una sola vez)

1. Ir a https://partners.shopify.com → crear cuenta Partner (gratis)
2. Crear app → tipo "Custom app"
3. Configurar:
   - App URL: `https://cotizador-api.s6hx3x.easypanel.host/api/shopify/auth`
   - Redirect URL: `https://cotizador-api.s6hx3x.easypanel.host/api/shopify/callback`
   - Scopes: `read_products,write_products,read_orders,write_inventory_levels,read_locations`
4. Obtener: **API Key** + **API Secret** (estos son de Kudi, no del cliente)

### Paso 2: Flujo del usuario en Kudi

```
Usuario en Kudi:
  1. Va a Integraciones → Shopify
  2. Ingresa su Store URL: "hdt9ir-qt.myshopify.com"
  3. Click "Conectar con Shopify"
     ↓
  4. Se abre ventana de Shopify (OAuth authorize URL)
  5. Shopify pide al usuario: "¿Autorizar a Kudi?"
  6. Usuario acepta
     ↓
  7. Shopify redirige a nuestro callback con un `code`
  8. Kudi intercambia `code` por `access_token` permanente
  9. Token se guarda en `integraciones` table
  10. Listo — sync funciona
```

### Paso 3: Backend endpoints

```
GET  /api/shopify/auth?shop=xxx.myshopify.com
  → Redirige a Shopify OAuth: 
    https://{shop}/admin/oauth/authorize?client_id={API_KEY}&scope={SCOPES}&redirect_uri={CALLBACK}

GET  /api/shopify/callback?code=xxx&shop=xxx&hmac=xxx
  → Verifica HMAC con API_SECRET
  → POST https://{shop}/admin/oauth/access_token con { client_id, client_secret, code }
  → Shopify devuelve { access_token: "shpua_xxxxx" } (permanente!)
  → Guardar en integraciones table
  → Redirigir al frontend: kudi.nodumstudio.com/#/shopify?connected=true
```

## Env vars necesarias (en el VPS, una sola vez)

```env
SHOPIFY_API_KEY=xxx          # De Partners Dashboard
SHOPIFY_API_SECRET=xxx       # De Partners Dashboard
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_inventory_levels,read_locations
SHOPIFY_REDIRECT_URI=https://cotizador-api.s6hx3x.easypanel.host/api/shopify/callback
```

## Frontend: ShopifyPage simplificado

```
┌─────────────────────────────────────────────────┐
│ Shopify                                         │
│                                                 │
│  Store URL: [__________.myshopify.com]          │
│                                                 │
│  [🔗 Conectar con Shopify]                      │
│                                                 │
│  (Se abrirá Shopify para autorizar a Kudi)      │
└─────────────────────────────────────────────────┘
```

Después de conectar:
```
┌─────────────────────────────────────────────────┐
│ ✅ Conectado a Once Joyas (hdt9ir-qt)           │
│                                                 │
│ [Sync Productos] [Pull Órdenes] [Push Stock]    │
│                                                 │
│ [Desconectar]                                   │
└─────────────────────────────────────────────────┘
```

## Ventajas de este approach

1. **El usuario NO necesita crear apps en Shopify** — solo ingresa su store URL y autoriza
2. **El token es permanente** (`shpua_` no expira)
3. **Una sola app de Kudi** sirve para todos los clientes
4. **Estándar OAuth 2.0** — Shopify lo soporta oficialmente

## Prerequisito

Necesitas crear la cuenta Partner de Shopify y registrar la app. Es gratis y toma 10 minutos.

URL: https://partners.shopify.com/signup

## Implementación: 1 sesión

1. Crear cuenta Partner + registrar app → obtener API_KEY y SECRET
2. Backend: 2 endpoints (auth redirect + callback)
3. Frontend: botón "Conectar con Shopify" que abre popup
4. El resto del sync (productos, órdenes, stock) ya está implementado
5. Tests con Once Joyas como primera tienda

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `server/src/routes/shopify.js` | Reemplazar POST /connect con GET /auth + GET /callback |
| `client/src/pages/ShopifyPage.jsx` | Botón OAuth en vez de input de token |
| VPS `.env` | Agregar SHOPIFY_API_KEY + SECRET |
