# Prompt de Contexto para Nueva Sesión — Kudi

Estoy trabajando en Kudi (antes Cotizador Nodum), una plataforma SaaS de costeo + finanzas + facturación para MYPEs productoras.

## Accesos

- **Repo**: /Users/sebastien/Documents/cotizador-nodum
- **Frontend**: kudi.nodumstudio.com (GitHub Pages, branch gh-pages)
- **API**: cotizador-api.s6hx3x.easypanel.host (Docker en Contabo VPS 95.111.254.27)
- **Stack**: React 19 + Vite 8 + Tailwind v4 | Express.js + JWT | PostgreSQL 16
- **APIsPeru**: nodumstudio2@gmail.com / Aubinaud_2 (facturación electrónica)
- **VPS SSH**: root@95.111.254.27 / Aubinaud919

## Cerebro (lee antes de hacer cambios)

- `cerebro/00-INICIO.md` — índice
- `cerebro/09-DESIGN-SYSTEM.md` — Apple+Airbnb+Seiko → ahora dark green #0A2F24
- `cerebro/13-PLAN-CASHFLOW.md` — flujo de caja
- `cerebro/14-PLAN-FACTURACION.md` — facturación SUNAT
- `cerebro/15-PLAN-GIRO-NEGOCIO.md` — 30 giros con terminología adaptativa
- `cerebro/16-PLAN-PEDIDOS-MULTIUSUARIO-AUDIT.md` — pedidos + multi-user + audit
- `cerebro/17-PLAN-MARKUP-ENVIO.md` — canales distribución + envío
- `cerebro/18-BUGS-MAYO-2026.md` — **PENDIENTE: 5 bugs a corregir**

## Skills obligatorias

- `nodum-ui-designer` — design system (dark sidebar, cx tokens, stone palette)
- `senior-backend` — APIs y BD

## Lo que está implementado (sesión abril-mayo 2026)

### Módulos core (ya existían)
- Cotizador con preparaciones, porciones, empaque, conversiones, CustomSelect
- P&L: transacciones unificadas, ventas, compras, gastos, estado de resultados

### Nuevos en esta sesión
1. **Pérdidas (Mermas + Desmedros)** + Ficha Técnica (10 secciones)
2. **Trial/Plan** + Permisos 3-estados (completo/vitrina/oculto)
3. **Flujo de Caja v3** — grid mensual 3 secciones, arqueo diario con denominaciones, transferencias, cuentas
4. **Facturación electrónica SUNAT** — APIsPeru, auto-login, emisión boleta/factura, PDF bajo demanda, config UI con guía paso a paso
5. **Giro de negocio** — 30 rubros, terminología adaptativa (useTerminos)
6. **Rebrand** — dark sidebar #0A2F24, logo K real, textura grain, colores #16A34A
7. **Audit Trail** — audit_log + created_by en 11 tablas + logAudit en 6 rutas
8. **Pedidos + Contra Entrega** — split payments, estados, trigger auto-monto, integración cash flow
9. **Multi-Usuario** — tabla empresas, empresa_id en 26 tablas, roles (owner/manager/cashier/vendedor/repartidor/contador/kitchen/viewer), equipo CRUD
10. **Canales de distribución** — tabs por canal, precios editables por producto, auto-cálculo comisión, modal desde producto
11. **Zonas + costo de envío** en ventas
12. **Clientes inline** en ventas (buscar/crear al vuelo)
13. **Spacing compacto** global (16 páginas + tokens)
14. **10 mejoras UI** — onboarding dark, scroll-to-top, P&L→Finanzas, más roles, giro en registro

## Deploy

```bash
# Backend: SCP → docker cp → restart
sshpass -p 'Aubinaud919' scp -o StrictHostKeyChecking=no FILE root@95.111.254.27:/tmp/kudi-deploy/
sshpass -p 'Aubinaud919' ssh root@95.111.254.27 "docker cp /tmp/kudi-deploy/FILE cotizador-nodum-api:/app/src/... && docker exec cotizador-nodum-api cp /app/.env /.env && docker restart cotizador-nodum-api"

# Frontend: build → gh-pages
cd client && npx vite build
# stash → checkout gh-pages → copy dist → commit → push → checkout main → stash pop
```

**IMPORTANTE**: El .env del container está en `/app/.env` pero dotenv busca en `/.env`. Siempre hacer `docker exec ... cp /app/.env /.env` antes de restart.

## PRÓXIMO PASO: Corregir 5 bugs (cerebro/18-BUGS-MAYO-2026.md)

1. **BUG #1**: CustomSelect de U.M. bloqueado cuando hay filtro de búsqueda activo (z-index)
2. **BUG #2**: Unidades de medida sin orden lógico (g→kg→ml→L→uni→oz)
3. **BUG #3**: CRÍTICO — No se puede crear insumos nuevos (error 500)
4. **BUG #4**: Selector U.M. del último insumo se abre fuera del viewport (necesita flip)
5. **BUG #5**: Eliminar insumo vinculado a receta muestra error genérico en vez de mensaje claro

Archivos a revisar para los bugs:
- `client/src/pages/InsumosPage.jsx` — UI de insumos
- `client/src/components/CustomSelect.jsx` — dropdown component (z-index, flip)
- `server/src/routes/insumos.js` — CRUD backend
- `server/src/utils/unidades.js` — conversiones

## BD: 40+ tablas

Las principales que necesitan empresa_id: insumos, materiales, preparaciones_predeterminadas, productos, periodos, transacciones, ventas, gastos, compras, clientes, pedidos, flujo_*, facturacion_config, comprobantes.

Tabla `empresas` vincula usuarios a negocio. `usuarios.empresa_id` + `rol_empresa`.

## Patrones clave

- Response format: `{ success: true, data: ... }` — frontend extrae con `res.data || res`
- NO usar `useCallback` con `[api]` como dep (causa infinite loop)
- `overflow-x: clip` en body (no `hidden`, permite sticky)
- `formatCurrency` auto 3 decimales si < 1
- Sidebar usa `permState()` para 3 estados: full/vitrina/hidden
- Todos los cambios se logean con `logAudit()`
