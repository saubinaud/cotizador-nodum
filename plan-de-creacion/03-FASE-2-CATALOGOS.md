# FASE 2: Catálogos (Insumos + Materiales)

**Dependencias:** FASE 0 completa
**Paralela con:** FASE 1 (Auth)
**Bloquea:** FASE 3 (Cotizador), FASE 4 (Predeterminados)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-2** | Supervisor Fase 2 | Coordina CRUD back+front |
| **W-BE-2** | Worker Backend | Endpoints CRUD insumos y materiales |
| **W-FE-2** | Worker Frontend | Tablas editables |
| **QA-2** | Tester | Prueba CRUD, validaciones, cascadas |

## Sub-fases

### SF-2A: Backend Insumos (W-BE-2) — PRIMERO

#### T2.1 — GET /api/insumos
**Estado:** [ ] Pendiente

- Auth requerida
- Filtra por usuario_id del JWT
- Retorna con costo_unitario calculado
- Filtro opcional: `?estado=activo`
- Orden: nombre ASC

#### T2.2 — POST /api/insumos
**Estado:** [ ] Pendiente

- Validaciones:
  - nombre: requerido, no vacío, no duplicado para este usuario
  - cantidad_presentacion: requerido, > 0
  - unidad_medida: requerido, enum ['g', 'ml', 'uni', 'oz', 'kg', 'l']
  - precio_presentacion: requerido, > 0
- Retorna el insumo creado con costo_unitario

#### T2.3 — PUT /api/insumos/:id
**Estado:** [ ] Pendiente

- Verifica que el insumo pertenece al usuario
- Mismas validaciones que POST
- Si cambió precio_presentacion o cantidad_presentacion:
  - Buscar productos afectados
  - Recalcular cada uno (ver servicio de recálculo)
  - Log en actividad_log
- Retorna: `{ insumo, productos_recalculados: N }`

#### T2.4 — DELETE /api/insumos/:id
**Estado:** [ ] Pendiente

- Verifica pertenencia al usuario
- Verifica si está en uso (producto_prep_insumos o prep_pred_insumos)
- Si en uso → soft delete (estado='inactivo'), retorna advertencia
- Si no en uso → hard delete
- Log en actividad_log

### SF-2B: Backend Materiales (W-BE-2) — PARALELO con SF-2A

#### T2.5 — CRUD /api/materiales (GET, POST, PUT, DELETE)
**Estado:** [ ] Pendiente

- Mismo patrón que insumos
- Campos adicionales: proveedor (opcional), detalle (opcional)
- Cascada: busca en producto_materiales + empaque_pred_materiales
- Validaciones idénticas + proveedor string opcional

### SF-2C: Servicio de recálculo (W-BE-2)

#### T2.6 — Servicio calcularCostos + recalcularProducto
**Estado:** [ ] Pendiente

```javascript
// server/src/services/calculador.js
// - calcularCostos(detalle) → { costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final }
// - recalcularProducto(productoId, motivo) → fetch data, calculate, update, version
// - recalcularProductosPorInsumo(insumoId, usuarioId) → find affected, recalculate each
// - recalcularProductosPorMaterial(materialId, usuarioId) → same for materials
```

Este servicio lo usan: FASE 2 (cascada), FASE 3 (crear/editar producto), FASE 5 (recálculo manual)

### SF-2D: Frontend Tabla Insumos (W-FE-2)

#### T2.7 — Página /insumos con tabla editable
**Estado:** [ ] Pendiente

- Tabla con columnas: Nombre, Presentación, Unidad, Precio, Costo Unit, Acciones
- Costo unitario calculado en vivo en el front (para preview)
- Botón [+ Nuevo insumo] → fila nueva editable al inicio de la tabla
- Click en fila → se vuelve editable (inline editing)
- [Guardar] → POST o PUT según sea nuevo o existente
- [Eliminar] → confirmación → DELETE
- Muestra toast "N productos recalculados" si aplica
- Búsqueda/filtro por nombre
- Responsive: en móvil se muestra como cards

#### T2.8 — Dropdown de unidades de medida
**Estado:** [ ] Pendiente

```javascript
const UNIDADES = [
  { value: 'g', label: 'Gramos (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'uni', label: 'Unidades' },
  { value: 'oz', label: 'Onzas (oz)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'l', label: 'Litros (l)' },
];
```

### SF-2E: Frontend Tabla Materiales (W-FE-2) — PARALELO con SF-2D

#### T2.9 — Página /materiales con tabla editable
**Estado:** [ ] Pendiente

- Mismo patrón que insumos
- Columnas adicionales: Proveedor, Detalle
- Misma lógica de inline editing
- Misma cascada visual

### SF-2F: Importar datos del Excel (W-BE-2) — OPCIONAL

#### T2.10 — Seed con datos del Excel
**Estado:** [ ] Pendiente

- Script SQL o endpoint para importar los ~40 insumos y ~13 materiales del Excel
- Solo para demo/testing
- No es feature de la app (los clientes llenan su propio catálogo)

## Criterio de completitud

- [ ] CRUD completo de insumos funciona (back + front)
- [ ] CRUD completo de materiales funciona (back + front)
- [ ] Costo unitario se calcula correctamente
- [ ] Tablas son editables inline
- [ ] Cascada de recálculo funciona al cambiar precios
- [ ] Validaciones previenen datos inválidos
- [ ] Soft delete funciona para items en uso
