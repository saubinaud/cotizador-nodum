# FASE 4: Predeterminados (Preparaciones y Empaques reutilizables)

**Dependencias:** FASE 2 (Catálogos)
**Paralela con:** FASE 3 (Cotizador)
**Bloquea:** Nada directamente (pero se integra con FASE 3)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-4** | Supervisor Fase 4 | Coordina CRUD predeterminados |
| **W-BE-4** | Worker Backend | Endpoints CRUD |
| **W-FE-4** | Worker Frontend | Páginas de gestión |
| **QA-4** | Tester | Prueba creación/uso en cotizador |

## Sub-fases

### SF-4A: Backend Preparaciones Predeterminadas (W-BE-4)

#### T4.1 — CRUD /api/preparaciones-predeterminadas
**Estado:** [ ] Pendiente

**GET** — Lista con costo calculado dinámicamente
- Agrupa insumos por preparación
- Calcula costo total de cada una en tiempo real

**POST** — Crear nueva preparación predeterminada
```json
{
  "nombre": "Formula 1A",
  "insumos": [
    { "insumo_id": 1, "cantidad": 200 },
    { "insumo_id": 5, "cantidad": 100 }
  ]
}
```

**PUT /:id** — Editar (reemplaza insumos)

**DELETE /:id** — Eliminar (no hay cascada a productos, los productos copian la data)

#### T4.2 — Endpoint para "usar predeterminada" en cotizador
**Estado:** [ ] Pendiente

**GET /api/preparaciones-predeterminadas/:id/detalle**
- Retorna la preparación con todos sus insumos y cantidades
- El frontend la inyecta como una nueva preparación en el cotizador

### SF-4B: Backend Empaques Predeterminados (W-BE-4) — PARALELO

#### T4.3 — CRUD /api/empaques-predeterminados
**Estado:** [ ] Pendiente

- Mismo patrón que preparaciones predeterminadas
- Pero con materiales en vez de insumos

#### T4.4 — Endpoint para "usar empaque predeterminado"
**Estado:** [ ] Pendiente

**GET /api/empaques-predeterminados/:id/detalle**
- Retorna materiales y cantidades
- El frontend los inyecta en la sección packaging del cotizador

### SF-4C: Frontend Preparaciones Predeterminadas (W-FE-4)

#### T4.5 — Página /preparaciones-predeterminadas
**Estado:** [ ] Pendiente

- Lista de preparaciones predeterminadas con costo
- [+ Nueva] → formulario:
  - Nombre
  - Tabla de insumos (mismo dropdown searchable de FASE 3)
  - Costo total calculado en vivo
- Editar/Eliminar

### SF-4D: Frontend Empaques Predeterminados (W-FE-4)

#### T4.6 — Página /empaques-predeterminados
**Estado:** [ ] Pendiente

- Mismo patrón que preparaciones
- Con materiales en vez de insumos

### SF-4E: Integración con Cotizador

#### T4.7 — Dropdown "Usar preparación predeterminada" en cotizador
**Estado:** [ ] Pendiente

- En cada sección de preparación del cotizador
- Al seleccionar: carga insumos y cantidades de la predeterminada
- El usuario puede modificar después (no queda linkeado)
- Es un "template" que se copia, no una referencia

#### T4.8 — Dropdown "Usar empaque predeterminado" en cotizador
**Estado:** [ ] Pendiente

- En la sección packaging del cotizador
- Al seleccionar: carga materiales y cantidades
- Mismo comportamiento: copia, no referencia

## Criterio de completitud

- [ ] CRUD completo de preparaciones predeterminadas
- [ ] CRUD completo de empaques predeterminados
- [ ] Costos se calculan dinámicamente (reflejan precios actuales)
- [ ] Se pueden usar desde el cotizador
- [ ] Al usar un predeterminado, se copian los datos (no referencia)
- [ ] El usuario puede modificar los datos copiados
