# Prompt de Contexto para Nueva Sesión — Kudi
> Última actualización: 3 mayo 2026, 04:30 AM Lima

Estoy trabajando en Kudi (antes Cotizador Nodum), una plataforma SaaS de costeo + finanzas + facturación para MYPEs productoras.

## Accesos

- **Repo**: /Users/sebastien/Documents/Dev/Kudi
- **Frontend**: kudi.nodumstudio.com (GitHub Pages, branch gh-pages)
- **API**: cotizador-api.s6hx3x.easypanel.host (Docker en Contabo VPS 95.111.254.27)
- **Stack**: React 19 + Vite 8 + Tailwind v4 | Express.js + JWT | PostgreSQL 16
- **Facturación**: Lycet (Greenter self-hosted) en Docker puerto 8050 — ver `cerebro/19-FACTURACION-LYCET.md`
- **VPS SSH**: root@95.111.254.27 / Aubinaud919

## Cerebro (lee antes de hacer cambios)

- `cerebro/00-INICIO.md` — índice
- `cerebro/09-DESIGN-SYSTEM.md` — Apple+Airbnb+Seiko → dark green #0A2F24
- `cerebro/14-PLAN-FACTURACION.md` — facturación SUNAT (plan original)
- `cerebro/19-FACTURACION-LYCET.md` — **ARQUITECTURA ACTUAL**: Lycet, multi-empresa, certificados, SOL

## Lo que está implementado

### Módulos core
- Cotizador con preparaciones, porciones, empaque (accordion), conversiones, CustomSelect con flip
- P&L: transacciones unificadas, ventas, compras, gastos, estado de resultados
- Flujo de Caja v3 — grid mensual, arqueo diario, transferencias, cuentas
- Facturación electrónica SUNAT — Lycet/Greenter self-hosted, S/0/mes, multi-empresa automático
- Giro de negocio — 30 rubros, terminología adaptativa (useTerminos)
- Pedidos + Contra Entrega — split payments, estados, integración cash flow
- Multi-Usuario — tabla empresas, empresa_id en 26 tablas, roles (owner/manager/cashier/vendedor/repartidor/contador/kitchen/viewer), equipo CRUD
- Canales de distribución — precios editables, auto-cálculo comisión
- Pérdidas (Mermas + Desmedros) + Ficha Técnica (10 secciones)
- Trial/Plan + Permisos 3-estados (completo/vitrina/oculto) con dependencias

### Sesión 2-3 mayo 2026
1. **Facturación Lycet** — migración APIsPeru→Greenter self-hosted, cert RENIEC OK, boleta emitida
2. **20+ bugs corregidos** — ingredientes, recetas, cotizador, sidebar, comprobantes, ventas
3. **Sidebar redesign** — Kudi siempre arriba, tree lines, collapse profesional
4. **Menú reorganizado** — Catálogo / Ventas / Finanzas / Facturación
5. **Multi-tenant** — 135 queries migradas de usuario_id→empresa_id (37/37 tests PASS)
6. **Eliminar periodo_id** — filtrado por year+month directo, PeriodoSelector component
7. **SUNAT error codes** — 15+ códigos mapeados con mensajes humanos
8. **Canales fix** — canal_id faltante en productos query
9. **Rentabilidad** — NUEVO módulo: semáforo de márgenes + simulador de bundles
10. **Animations** — transition-all→transition-colors, 150ms→100ms
11. **Tipo contribuyente** — selector único (18% / 10.5% / No paga IGV)
12. **Login biométrico** — autocomplete para huella/Face ID

## Estado actual

- **Multi-tenant**: COMPLETADO — req.eid en todos los routes, empresa_id en todas las tablas
- **Periodos**: ELIMINADO como dependencia — filtrado por fecha directa, periodos opcionales
- **Facturación**: Lycet self-hosted, S/0/mes, multi-empresa, timezone Lima
- **Rentabilidad**: Semáforo verde/amarillo/rojo por producto + bundle simulator

## PENDIENTES para próxima sesión

- **Fase 4 periodo_id**: Drop columna de INSERTs (mantener nullable por ahora)
- **Comparador avanzado**: Evolucionar rentabilidad con tendencias históricas, alertas automáticas
- **Canales UX**: Verificar pricing en producción
- Validar SOL como sección independiente en comprobantes

## Patrones clave

- Response format: `{ success: true, data: ... }` — frontend extrae con `res.data || res`
- NO usar `useCallback` con `[api]` como dep (causa infinite loop)
- `overflow-x: clip` en body (no `hidden`, permite sticky)
- `formatCurrency` auto 3 decimales si < 1
- Sidebar usa `permState()` para 3 estados: full/vitrina/hidden
- Todos los cambios se logean con `logAudit()`
- Timezone: todo lo que va a SUNAT = hora Lima (UTC-5)
- IGV: 18% general, 10.5% restaurantes — solo esas dos opciones
- Fechas Lycet: sin milisegundos (`.replace(/\.\d{3}Z$/, '-05:00')`)

## Deploy

```bash
# Backend: SCP → docker cp → restart
sshpass -p 'Aubinaud919' scp -o StrictHostKeyChecking=no FILE root@95.111.254.27:/tmp/kudi-deploy/
sshpass -p 'Aubinaud919' ssh root@95.111.254.27 "docker cp /tmp/kudi-deploy/FILE cotizador-nodum-api:/app/src/... && docker exec cotizador-nodum-api cp /app/.env /.env && docker restart cotizador-nodum-api"

# Frontend: build → gh-pages
cd client && npx vite build
git stash && git checkout gh-pages && rm -rf assets index.html && cp -r client/dist/* .
git add . && git commit && git push origin gh-pages
git checkout -- logo.svg && git checkout main && git stash pop
```

## BD: 40+ tablas

4 empresas: Sebastien (1), MILLECHES (2), Admin (3), CHUNKS (4)
Cada empresa tiene empresa_id en: insumos, materiales, preparaciones_predeterminadas, productos, periodos, transacciones, ventas, gastos, compras, clientes, pedidos, flujo_*, facturacion_config, comprobantes.

## Containers Docker

- `cotizador-nodum-api` — Express.js, puerto 3001
- `cotizador-nodum-db` — PostgreSQL, usuario `cotizador_user`, DB `cotizador_nodum`
- `lycet_app` — Greenter/Lycet, puerto 8050, facturación electrónica
