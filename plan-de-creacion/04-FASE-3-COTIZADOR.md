# FASE 3: Cotizador Core

**Dependencias:** FASE 0 + FASE 2 (necesita catálogos de insumos y materiales)
**Paralela con:** FASE 4 (Predeterminados)
**Bloquea:** FASE 5 (Historial)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-3** | Supervisor Fase 3 | Coordina el motor de cotización |
| **W-BE-3** | Worker Backend | Endpoints CRUD productos, cálculo server-side |
| **W-FE-3** | Worker Frontend | Formulario cotizador, dashboard |
| **QA-3** | Tester | Prueba cálculos, precisión, flujos completos |

## Sub-fases

### SF-3A: Backend Productos CRUD (W-BE-3) — PRIMERO

#### T3.1 — POST /api/productos (crear cotización)
**Estado:** [ ] Pendiente

Recibe:
```json
{
  "nombre": "Empanada",
  "margen": 0.50,
  "preparaciones": [
    {
      "nombre": "Masa",
      "orden": 1,
      "capacidad": 500,
      "unidad_capacidad": "g",
      "insumos": [
        { "insumo_id": 14, "cantidad": 500 },
        { "insumo_id": 6, "cantidad": 100 }
      ]
    },
    {
      "nombre": "Relleno",
      "orden": 2,
      "capacidad": 300,
      "unidad_capacidad": "g",
      "insumos": [
        { "insumo_id": 33, "cantidad": 200 },
        { "insumo_id": 34, "cantidad": 100 }
      ]
    }
  ],
  "materiales": [
    { "material_id": 1, "cantidad": 1 },
    { "material_id": 5, "cantidad": 1 }
  ]
}
```

Lógica:
1. Validar todos los insumo_id y material_id pertenecen al usuario
2. Crear producto (igv_rate hereda del usuario)
3. Crear preparaciones
4. Crear producto_prep_insumos
5. Crear producto_materiales
6. Calcular costos (servicio calculador de FASE 2)
7. Actualizar producto con costos
8. Crear versión 1 (snapshot)
9. Log
10. Todo en transacción

#### T3.2 — GET /api/productos (listar - dashboard)
**Estado:** [ ] Pendiente

- Auth requerida
- Paginación: `?page=1&limit=20`
- Búsqueda: `?buscar=empanada`
- Orden: `?orden=updated_at&dir=desc`
- Retorna: lista con costos calculados

#### T3.3 — GET /api/productos/:id (detalle completo)
**Estado:** [ ] Pendiente

- Retorna:
  - Datos base del producto
  - Array de preparaciones, cada una con array de insumos (nombre, cantidad, unidad, costo_unitario, costo_linea)
  - Array de materiales (nombre, cantidad, costo_unitario, costo_linea)
  - Subtotales por preparación
  - Totales: costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final

#### T3.4 — PUT /api/productos/:id (editar cotización)
**Estado:** [ ] Pendiente

- Mismo formato que POST
- En transacción:
  1. Borrar preparaciones + insumos + materiales anteriores (CASCADE)
  2. Re-insertar todo
  3. Recalcular costos
  4. Incrementar version_actual
  5. Crear snapshot nueva versión (motivo='edicion')
  6. Log con cambios

#### T3.5 — DELETE /api/productos/:id
**Estado:** [ ] Pendiente

- Confirmación en el front
- CASCADE borra todo lo asociado
- Log con nombre del producto eliminado

#### T3.6 — POST /api/productos/:id/duplicar
**Estado:** [ ] Pendiente

- Crea copia del producto con nombre "[original] (copia)"
- Duplica todas las preparaciones, insumos y materiales
- Recalcula costos (pueden haber cambiado precios desde la creación)
- Versión 1 del nuevo producto

### SF-3B: Frontend Dashboard (W-FE-3) — PARALELO con backend

#### T3.7 — Página /dashboard
**Estado:** [ ] Pendiente

- Grid/tabla de productos cotizados del usuario
- Columnas: Nombre, Costo Neto, Margen, Precio Final, Última edición
- Acciones por producto: Editar, Duplicar, Eliminar, Ver historial
- Botón [+ Nuevo producto] → navega a /cotizador
- Búsqueda por nombre
- Cards en móvil, tabla en desktop
- Stats arriba: total productos, costo promedio, último creado

#### T3.8 — Resumen visual de costos
**Estado:** [ ] Pendiente

- En cada card/fila del dashboard:
  - Barra de proporción: costo insumos vs costo empaque
  - Margen visual (% en badge)
  - Precio final destacado

### SF-3C: Frontend Cotizador (W-FE-3) — EL COMPONENTE PRINCIPAL

#### T3.9 — Página /cotizador (crear)
**Estado:** [ ] Pendiente

Secciones del formulario:
1. **Header**: Nombre del producto (input grande)
2. **Preparaciones**: Sección dinámica
   - [+ Agregar preparación]
   - Cada preparación:
     - Nombre editable
     - Capacidad + unidad
     - Tabla de insumos:
       - Dropdown searchable de insumos del catálogo
       - Input cantidad
       - Unidad (auto del insumo)
       - Costo unitario (auto)
       - Costo línea (auto: cantidad × costo_unit)
       - [x] Eliminar
       - [+ Agregar insumo]
     - Subtotal preparación
   - [x] Eliminar preparación
   - O: dropdown "Usar preparación predeterminada"
3. **Packaging**: Sección dinámica
   - Dropdown searchable de materiales
   - Input cantidad (entero)
   - Costo unitario (auto)
   - Costo línea (auto)
   - [+ Agregar material]
   - O: dropdown "Usar empaque predeterminado"
4. **Resumen de costos** (sticky en la derecha o bottom):
   - Costo insumos: S/ XX.XX
   - Costo empaque: S/ XX.XX
   - Costo neto: S/ XX.XX
   - Margen: slider/input (default del usuario o 50%)
   - Precio venta: S/ XX.XX
   - IGV: XX.X% (del perfil)
   - **Precio final: S/ XX.XX** (destacado)
5. **Acciones**:
   - [Vaciar] → reset todo
   - [Guardar] → POST
   - [Cancelar] → volver al dashboard

**Cálculo en vivo:**
- TODOS los costos se calculan en el frontend mientras el usuario llena
- Al guardar, el backend recalcula server-side (fuente de verdad)
- Si hay diferencia → se usa el del backend

#### T3.10 — Página /cotizador/:id (editar)
**Estado:** [ ] Pendiente

- Mismo componente que crear
- Al cargar: GET /api/productos/:id → pre-llena todo el formulario
- Al guardar: PUT en vez de POST
- Muestra versión actual
- Botón "Ver historial de cambios"

#### T3.11 — Dropdown searchable de insumos
**Estado:** [ ] Pendiente

- Componente reutilizable
- Carga insumos del catálogo del usuario
- Filtro por nombre while typing
- Muestra: nombre + unidad + costo unitario
- Si el insumo no existe: link rápido "Agregar nuevo insumo"

#### T3.12 — Dropdown searchable de materiales
**Estado:** [ ] Pendiente

- Mismo patrón que insumos
- Muestra: nombre + proveedor + costo unitario

#### T3.13 — Cálculo en vivo (hook)
**Estado:** [ ] Pendiente

```javascript
// hooks/useCalculadorCostos.js
// Recibe: preparaciones[], materiales[], margen, igv_rate
// Retorna: costo_insumos, costo_empaque, costo_neto, precio_venta, precio_final
// Se recalcula en cada cambio de input
```

#### T3.14 — Validaciones del cotizador
**Estado:** [ ] Pendiente

- Nombre del producto: requerido
- Al menos 1 preparación
- Cada preparación: al menos 1 insumo
- Cantidades: > 0
- Margen: 0 < margen < 1 (0% a 99%)
- No se puede guardar con errores

## Criterio de completitud

- [ ] Crear producto con N preparaciones y N insumos cada una
- [ ] Editar producto existente (pre-llena formulario)
- [ ] Duplicar producto
- [ ] Eliminar producto
- [ ] Cálculos son correctos (verificar con datos del Excel)
- [ ] Dashboard lista todos los productos con costos
- [ ] Dropdown searchable funciona con catálogos grandes
- [ ] Cálculo en vivo coincide con cálculo del backend
- [ ] Validaciones previenen envíos incorrectos
