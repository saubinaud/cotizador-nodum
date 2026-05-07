# Prompt de Contexto para Nueva Sesión — Kudi
> Última actualización: 6 mayo 2026, 07:00 AM Lima

Estoy trabajando en Kudi, una plataforma SaaS de costeo + finanzas + facturación + inventario para MYPEs productoras y comercializadoras.

## Accesos

- **Repo**: /Users/sebastien/Documents/Dev/Kudi
- **Frontend**: kudi.nodumstudio.com (GitHub Pages, branch gh-pages)
- **API**: cotizador-api.s6hx3x.easypanel.host (Docker en Contabo VPS 95.111.254.27)
- **Stack**: React 19 + Vite 8 + Tailwind v4 | Express.js + JWT | PostgreSQL 16
- **VPS SSH**: root@95.111.254.27 / Aubinaud919
- **Facturación**: Lycet (Greenter self-hosted) Docker puerto 8050
- **Imágenes**: Cloudflare R2 bucket `kudi` (10GB free)
- **Backups**: Cron 12AM Lima → VPS + R2 (30 días retención)

## LO PRIMERO: Corregir 6 bugs de integración

Lee `cerebro/22-BUGS-INTEGRACION-MAYO-2026.md` — tiene diagnóstico completo, causa raíz, archivos y líneas exactas.

### Los 6 bugs:

1. **Ticket térmico error** — `ticket.js:23` usa `vi.producto_nombre` que no existe → cambiar a `p.nombre`
2. **Contra entrega duplica montos** — venta de S/20 aparece como S/40 en estado financiero porque pagos se registran como ingresos
3. **Rentabilidad costos en 0** — `analisis.js` no aplica round2, parseFloat falla con NULLs
4. **Stock no muestra productos** — modal filtra `control_stock=true` pero ningún producto tiene la flag
5. **Compras no actualizan stock** — comprar 10 anillos no se refleja en inventario
6. **Decimales excesivos** — round2 faltante en analisis.js, comisiones.js, ticket.js

### Estrategia de corrección:
- Sub-agente A: Bugs 1 + 6 (ticket + decimales)
- Sub-agente B: Bugs 2 + 3 (contra entrega + rentabilidad)
- Sub-agente C: Bugs 4 + 5 (stock)
- Luego: tests E2E de cada módulo

## DESPUÉS: Pendientes de features

- **Shopify OAuth** — Implementar auth directo via Partners Dashboard. Plan en `cerebro/23-PLAN-SHOPIFY-AUTH-DIRECTO.md`. Prerequisito: crear cuenta Partner en shopify.com y registrar app Kudi.
- **Órdenes de compra** — PDF, estados (borrador/enviada/recibida), tipo cambio USD. Plan en `cerebro/20-PLAN-COMERCIO-STOCK.md`
- **Cartas y categorías** — organizar productos por catálogos

## Patrones clave del proyecto

- Multi-tenant: `req.eid` (empresa_id), `req.uid` (usuario_id)
- Precios: siempre 2 decimales (round2)
- Timezone: hora Lima (UTC-5) para todo
- Periodos: eliminados — filtrado por `?year=X&month=Y`
- Response: `{ success: true, data: ... }`
- Deploy backend: SCP → docker cp → restart
- Deploy frontend: vite build → gh-pages
- NO usar `useCallback` con `[api]`
- NO usar `transition-all` (usar `transition-colors duration-100`)
- NO usar `confirm()` / `prompt()` nativos (usar ConfirmDialog/PromptDialog)
- NO auto-crear datos en GET (REST: GETs son read-only)
- Token localStorage: `nodum_token`

## Documentación completa

- `cerebro/19-FACTURACION-LYCET.md` — facturación electrónica
- `cerebro/20-PLAN-COMERCIO-STOCK.md` — roadmap stock/comisiones/shopify
- `cerebro/21-PLAN-SHOPIFY.md` — integración Shopify detallada
- `cerebro/22-BUGS-INTEGRACION-MAYO-2026.md` — **LOS 6 BUGS A CORREGIR**
- `.claude/plans/twinkling-stargazing-aurora.md` — plan activo

## BD: Tablas principales

4 empresas. 26+ tablas con empresa_id. Nuevas tablas: stock_movimientos, comisiones, proveedores, integraciones, sync_log, venta_items.
