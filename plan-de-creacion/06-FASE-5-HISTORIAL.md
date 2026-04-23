# FASE 5: Historial y Auditoría

**Dependencias:** FASE 3 (Cotizador Core)
**Paralela con:** Nada (última fase funcional)
**Bloquea:** FASE 6 (Deploy)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-5** | Supervisor Fase 5 | Coordina historial back+front |
| **W-BE-5** | Worker Backend | Endpoints de versiones y logs |
| **W-FE-5** | Worker Frontend | UI de historial y actividad |
| **QA-5** | Tester | Verifica que versiones se crean correctamente |

## Sub-fases

### SF-5A: Backend Historial de Versiones (W-BE-5)

#### T5.1 — GET /api/productos/:id/versiones
**Estado:** [ ] Pendiente

- Lista de versiones del producto
- Campos: version, motivo, costo_neto, precio_final, created_at
- Orden: versión DESC (más reciente primero)

#### T5.2 — GET /api/productos/:id/versiones/:version
**Estado:** [ ] Pendiente

- Detalle completo de una versión específica
- Retorna el snapshot_json con toda la receta tal como estaba
- Incluye: preparaciones, insumos, cantidades, costos de ese momento

#### T5.3 — POST /api/productos/:id/recalcular
**Estado:** [ ] Pendiente

- Recalcula el producto con precios actuales de insumos/materiales
- Crea nueva versión (motivo='recalculo_manual')
- Útil cuando el usuario quiere ver el impacto de cambios de precio
- Retorna: costos anteriores vs nuevos

### SF-5B: Backend Log de Actividad (W-BE-5)

#### T5.4 — GET /api/actividad
**Estado:** [ ] Pendiente

- Log general del usuario
- Paginación: `?page=1&limit=50`
- Filtros opcionales: `?entidad=insumo`, `?accion=editar`
- Incluye nombre de la entidad (JOIN condicional)
- Orden: created_at DESC

### SF-5C: Frontend Historial de Producto (W-FE-5)

#### T5.5 — Modal/panel de versiones en dashboard
**Estado:** [ ] Pendiente

- Desde el dashboard, botón [Historial] en cada producto
- Abre modal con timeline de versiones:
  - Cada versión: fecha, motivo, costo neto, precio final
  - Indicador visual de cambio (▲ subió / ▼ bajó / = igual)
  - Click en versión → expande detalle completo del snapshot

#### T5.6 — Comparador de versiones (opcional/nice-to-have)
**Estado:** [ ] Pendiente

- Seleccionar 2 versiones y ver diff:
  - Qué insumos se agregaron/quitaron
  - Qué cantidades cambiaron
  - Diferencia de costos
- Highlight visual de los cambios

### SF-5D: Frontend Log de Actividad (W-FE-5)

#### T5.7 — Página o sección de actividad reciente
**Estado:** [ ] Pendiente

- Timeline de acciones del usuario
- Íconos por tipo de acción (crear, editar, eliminar, recalcular)
- Formato: "Editaste el insumo Harina (precio: S/4.50 → S/5.00) — hace 2 horas"
- Filtros por entidad y acción
- Paginación

#### T5.8 — Notificaciones de recálculo
**Estado:** [ ] Pendiente

- Cuando se edita un insumo y se recalculan productos:
  - Toast inmediato: "3 productos recalculados"
  - En el log: detalle de cada producto afectado
- En el dashboard: badge en productos recalculados recientemente

## Criterio de completitud

- [ ] Cada creación/edición de producto crea una versión
- [ ] Cada recálculo por cambio de precio crea una versión
- [ ] El usuario puede ver todas las versiones de un producto
- [ ] El usuario puede ver el detalle completo de cada versión
- [ ] El log de actividad registra todas las acciones
- [ ] El log es navegable y filtrable
