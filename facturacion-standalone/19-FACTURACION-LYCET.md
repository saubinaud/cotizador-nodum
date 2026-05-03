# Facturación Electrónica — Arquitectura Lycet (Greenter Self-Hosted)

> Migrado de APIsPeru a Lycet el 2 de mayo 2026.
> Lycet = API REST wrapper de Greenter (PHP open source), hosteado en el VPS Contabo.
> Costo: S/ 0/mes (vs S/ 25/mes de APIsPeru).

---

## Arquitectura

```
[Usuario Kudi] → [Kudi API (Node.js)] → [Lycet (PHP/Greenter)] → [SUNAT]
                    puerto 3001              puerto 8050           producción
                    Docker                   Docker
                    cotizador-nodum-api      lycet_app
```

Ambos containers corren en el VPS Contabo (95.111.254.27).
Kudi se conecta a Lycet via `http://172.17.0.1:8050/api/v1` (Docker bridge).

---

## Lycet — Configuración

### Container
```bash
docker run -d \
  -p 0.0.0.0:8050:8000 \
  -v /opt/lycet/data:/var/www/html/data \
  --env-file /opt/lycet/.env \
  --name lycet_app \
  --restart unless-stopped \
  lycet
```

### Env vars (`/opt/lycet/.env`)
```
CLIENT_TOKEN=kudi-lycet-2026-secure    # Token para autenticar requests
SOL_USER=<RUC><SOL_USER>              # Default company (fallback)
SOL_PASS=<password>
FE_URL=https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
RE_URL=https://e-factura.sunat.gob.pe/ol-ti-itemision-otroscpe-gem/billService
GUIA_URL=https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService
```

### Data directory (`/opt/lycet/data/`)
```
cert.pem              # Default certificate (fallback)
logo.png              # Default logo
empresas.json         # Multi-company registry (auto-generated)
{RUC}-cert.pem        # Per-company certificates (auto-generated)
{RUC}-logo.png        # Per-company logos (optional)
```

---

## Multi-Empresa — Flujo Automático

### Cuando un usuario sube su certificado `.p12` en Kudi:

1. **Kudi** convierte P12→PEM con `openssl` local
2. **Kudi** encripta el PEM con AES-256 y lo guarda en `facturacion_config.certificado_pem`
3. **Kudi** llama `syncLycetCompany(userId)` que:
   - Lee el RUC del usuario
   - Lee `sol_user`, `sol_pass`, `certificado_pem` de `facturacion_config`
   - Desencripta el PEM
   - Envía `PUT /api/v1/configuration/company/{ruc}` a Lycet con:
     ```json
     {
       "SOL_USER": "{ruc}{sol_user}",
       "SOL_PASS": "{sol_pass}",
       "certificate": "{pem_base64}"
     }
     ```
4. **Lycet** guarda `{ruc}-cert.pem` en `/data/` y actualiza `empresas.json`

### Cuando un usuario actualiza credenciales SOL:

1. **Kudi** guarda `sol_user` y `sol_pass` en `facturacion_config`
2. **Kudi** llama `syncLycetCompany(userId)` → re-registra la empresa en Lycet

### Cuando se emite una factura/boleta:

1. **Kudi** construye el invoice JSON con `buildInvoiceJSON()` (formato UBL 2.1)
2. El JSON incluye `company.ruc` del usuario
3. **Kudi** envía a Lycet: `POST /api/v1/invoice/send?token=...`
4. **Lycet** busca el RUC en `empresas.json` → usa el cert y SOL de esa empresa
5. **Lycet** firma el XML, lo envía a SUNAT, devuelve la respuesta
6. **Kudi** guarda el comprobante en la tabla `comprobantes`

---

## Endpoints Lycet usados por Kudi

| Método | Endpoint | Uso |
|--------|----------|-----|
| POST | `/api/v1/invoice/send` | Firmar + enviar a SUNAT |
| POST | `/api/v1/invoice/pdf` | Generar PDF (devuelve `application/pdf` binario) |
| PUT | `/api/v1/configuration/company/{ruc}` | Registrar/actualizar empresa |

Auth: `?token=kudi-lycet-2026-secure` en query string.

---

## Env vars en Kudi (`.env` del container)

```
LYCET_URL=http://172.17.0.1:8050/api/v1
LYCET_TOKEN=kudi-lycet-2026-secure
FACTURACION_CERT_KEY=798a738db65347ffbb15456477806958c90e672c051356a1d59b5b2e4b1df232
```

---

## Formato fechaEmision

Lycet/Greenter requiere formato `Y-m-d\TH:i:sP` SIN milisegundos.
El código usa: `new Date().toISOString().replace(/\.\d{3}Z$/, '-05:00')`

---

## Notas importantes

- **PDF**: Lycet devuelve `application/pdf` binario, no JSON. `callLycet()` detecta el Content-Type y convierte a base64 automáticamente.
- **SOL_USER**: Formato concatenado `{RUC}{usuario_secundario}`. Ejemplo: `10757645675EMISOR01`.
- **Certificado**: Debe ser un `.p12` de SUNAT/RENIEC. Se convierte a PEM con `openssl -legacy`.
- **Restart**: `--restart unless-stopped` asegura que Lycet sobrevive reinicios del VPS.
- **Seguridad**: Puerto 8050 solo accesible desde localhost (Docker bridge). No expuesto a internet.

---

## Rollback a APIsPeru

Si necesitas volver a APIsPeru, el código anterior está en git. Solo necesitas:
1. Restaurar `facturacion.js` del commit anterior
2. Restaurar las env vars `APISPERU_*`
3. Detener el container Lycet
