# Shopify Auth: Client Credentials Grant

> Documentado: 6 mayo 2026
> Método descubierto probando con Once Joyas (hdt9ir-qt.myshopify.com)

---

## Cómo funciona

Shopify 2026 ya no da tokens `shpat_` directamente en el admin. Pero las Custom Apps creadas desde el Developer Dashboard generan un **Client ID** + **Client Secret** que se pueden intercambiar por un access token via `client_credentials` grant.

### El endpoint mágico

```bash
POST https://{store}.myshopify.com/admin/oauth/access_token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&grant_type=client_credentials
```

### Respuesta

```json
{
  "access_token": "shpat_XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "scope": "",
  "expires_in": 86399
}
```

- El token empieza con `shpat_` (funciona con `X-Shopify-Access-Token` header)
- Expira en 24 horas (`86399` segundos)
- Se puede regenerar infinitamente con las mismas credenciales
- **NO requiere OAuth flow, ni CLI, ni popup, ni redirect**

---

## Lo que el usuario necesita hacer (una sola vez)

1. Ir a Shopify Admin → Settings → Apps → Develop apps
2. Crear una app (o usar una existente)
3. Configurar scopes: `read_products`, `write_products`, `read_orders`, etc.
4. Install app
5. Copiar **Client ID** y **Client Secret** (NO el `atkn_` — ese no sirve)
6. Pegarlos en Kudi → Integraciones → Shopify → Conectar

## Lo que Kudi hace automáticamente

1. Recibe `client_id` + `client_secret` + `store_url`
2. Llama al endpoint de token exchange
3. Obtiene `shpat_` temporal (24h)
4. Lo cachea en memoria (23h para renovar antes de expirar)
5. Antes de cada llamada a Shopify API, verifica si el token está vigente
6. Si expiró, lo renueva automáticamente con las mismas credenciales

## Implementación en Kudi

### Backend (`server/src/routes/shopify.js`)

```js
// Token cache
const _tokenCache = {};

async function getShopifyToken(storeUrl, clientId, clientSecret) {
  const cached = _tokenCache[storeUrl];
  if (cached && Date.now() < cached.expires) return cached.token;

  const res = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
  });
  const data = await res.json();

  _tokenCache[storeUrl] = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 3600) * 1000, // renew 1h before expiry
  };
  return data.access_token;
}
```

### BD

```sql
-- integraciones table stores client_id + client_secret in config JSONB
-- access_token column = 'auto' (token se genera en runtime)
INSERT INTO integraciones (empresa_id, tipo, access_token, config)
VALUES (4, 'shopify', 'auto', '{
  "store_url": "hdt9ir-qt.myshopify.com",
  "client_id": "87ee354...",
  "client_secret": "shpss_...",
  "store_name": "Once Joyas"
}');
```

### Frontend

El usuario ingresa 3 campos:
- Store URL: `xxx.myshopify.com`
- Client ID: `87ee354...`
- Client Secret: `shpss_...`

---

## Tokens que da Shopify y para qué sirven

| Token | Formato | Para qué | Sirve para API? |
|-------|---------|----------|-----------------|
| Admin API access token | `shpat_xxx` | Llamadas API | ✅ SÍ |
| App session token | `atkn_xxx` | Sesión del CLI/app | ❌ NO |
| Client ID | `87ee354...` | Identificar la app | ❌ Solo para auth |
| Client Secret | `shpss_xxx` | Firmar requests | ❌ Solo para auth |

**El `atkn_` NO sirve para API.** Solo el `shpat_` funciona con `X-Shopify-Access-Token`.

---

## Notas importantes

- El `scope` en la respuesta viene vacío `""` — esto es normal para client_credentials
- Los scopes reales dependen de lo que se configuró al crear la app en Shopify
- Si la app no tiene scope `read_locations`, las queries de locations fallan (Kudi lo maneja como opcional)
- El token se renueva con las mismas credenciales — no hay refresh_token
- Si el dueño de la tienda revoca la app, las credenciales dejan de funcionar

## Primera conexión exitosa

```
Tienda: Once Joyas | Joyería para Hombres
Store URL: hdt9ir-qt.myshopify.com
Fecha: 6 mayo 2026
Token obtenido: shpat_XXXXXXXXXXXXXXXXXXXXXXXXXXXX (24h)
```
