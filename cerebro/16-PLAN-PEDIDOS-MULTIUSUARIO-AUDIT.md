# Plan Maestro — Pedidos (Contra Entrega) + Multi-Usuario + Audit Trail

> Análisis completo de BD, migración incremental, impacto en módulos existentes

---

## ESTADO ACTUAL DE LA BD

### 36 tablas, 26 con `usuario_id` como clave de aislamiento

**Tablas de datos del negocio (26):**
insumos, materiales, preparaciones_predeterminadas, empaques_predeterminados, productos, periodos, transacciones, categorias_gasto, ventas, gastos, ventas_periodo, compras, mediciones_merma_insumo, mediciones_merma_preparacion, desmedros_producto, desmedros_preparacion, desmedros_insumo, desmedros_material, flujo_cuentas, flujo_categorias, flujo_arqueos, flujo_transferencias, facturacion_config, comprobantes, clientes, actividad_log

**Tablas de referencia global (3):** paises, giros_negocio, denominaciones

**Tablas hijo (sin usuario_id directo, heredan del padre):**
prep_pred_insumos, empaque_pred_materiales, producto_preparaciones, producto_prep_insumos, producto_materiales, producto_versiones, insumo_precios, compra_items, flujo_arqueo_detalles

---

## FASE 1: AUDIT TRAIL MEJORADO

### Objetivo
Registrar QUIÉN hizo CADA acción, con descripción legible.

### BD: Nueva tabla `audit_log` (reemplaza `actividad_log`)

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL DEFAULT 0,
  usuario_nombre VARCHAR(200),
  entidad VARCHAR(50) NOT NULL,
  entidad_id INTEGER,
  accion VARCHAR(20) NOT NULL,
  descripcion TEXT,
  cambios_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_usuario ON audit_log(usuario_id);
CREATE INDEX idx_audit_entidad ON audit_log(entidad, entidad_id);
CREATE INDEX idx_audit_fecha ON audit_log(created_at DESC);
```

### BD: Agregar `created_by` / `updated_by` a tablas clave

```sql
-- Tablas que necesitan columnas de auditoría:
ALTER TABLE productos ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_by INTEGER;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS updated_by INTEGER;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE materiales ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS created_by INTEGER;
```

### Backend: Helper de logging

```javascript
// utils/audit.js
async function logAudit(pool, { userId, userName, entidad, entidadId, accion, descripcion, cambios }) {
  await pool.query(
    `INSERT INTO audit_log (usuario_id, usuario_nombre, entidad, entidad_id, accion, descripcion, cambios_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, userName, entidad, entidadId, accion, descripcion, cambios ? JSON.stringify(cambios) : null]
  );
}
```

### Frontend: Página de actividad mejorada
- Timeline con avatar del usuario + acción + hora
- Filtros por entidad, usuario, fecha
- "María registró venta S/150 — hace 2 horas"

### Impacto en rutas existentes
Agregar `logAudit()` después de cada INSERT/UPDATE/DELETE en:
- productos.js (crear, editar, eliminar, duplicar)
- pl.js (ventas, gastos, compras)
- insumos.js, materiales.js
- facturacion.js (emitir, anular)
- flujo.js (movimientos, arqueos, transferencias)
- perdidas.js (mermas, desmedros)

---

## FASE 2: PEDIDOS Y CONTRA ENTREGA

### Objetivo
Manejar ventas con pagos parciales (adelanto + restante al entregar).

### BD: 2 tablas nuevas

```sql
CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  
  -- Detalle del pedido
  descripcion TEXT NOT NULL,
  items_json JSONB,
  
  -- Montos
  monto_total NUMERIC(10,2) NOT NULL,
  monto_pagado NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  tipo_pago VARCHAR(20) NOT NULL DEFAULT 'contado',
  
  -- Fechas
  fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_entrega_estimada DATE,
  fecha_entrega_real TIMESTAMPTZ,
  
  notas TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pagos_pedido (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  monto NUMERIC(10,2) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  cuenta_id INTEGER REFERENCES flujo_cuentas(id),
  tipo VARCHAR(20) NOT NULL DEFAULT 'adelanto',
  transaccion_id INTEGER REFERENCES transacciones(id),
  notas TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha_entrega_estimada);
CREATE INDEX idx_pagos_pedido ON pagos_pedido(pedido_id);

-- Trigger: auto-update monto_pagado
CREATE OR REPLACE FUNCTION update_pedido_monto_pagado()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pedidos SET
    monto_pagado = (SELECT COALESCE(SUM(monto), 0) FROM pagos_pedido WHERE pedido_id = NEW.pedido_id),
    estado = CASE
      WHEN (SELECT COALESCE(SUM(monto), 0) FROM pagos_pedido WHERE pedido_id = NEW.pedido_id) >= monto_total
      THEN 'pagado' ELSE estado END,
    updated_at = NOW()
  WHERE id = NEW.pedido_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pagos_update
AFTER INSERT OR DELETE ON pagos_pedido
FOR EACH ROW EXECUTE FUNCTION update_pedido_monto_pagado();
```

### Estados del pedido

```
pendiente → en_produccion → listo → entregado → pagado
                                                  ↑
                                    (auto al completar pagos)
         → cancelado (desde cualquier estado)
```

### Interacción con módulos existentes

| Módulo | Interacción |
|--------|-------------|
| **Cash flow** | Cada pago (adelanto/restante) crea una `transaccion` con monto positivo |
| **Cuentas** | El pago actualiza el saldo de la cuenta seleccionada |
| **P&L** | Revenue se reconoce al crear el pedido (monto_total completo) |
| **Facturación** | UNA boleta/factura por el total, con formaPago: Credito si tiene restante |
| **Clientes** | El pedido se vincula al cliente del catálogo |

### Facturación SUNAT para contra entrega

```javascript
// Si contra_entrega y tiene restante:
formaPago: {
  moneda: 'PEN',
  tipo: 'Credito',
  monto: pedido.monto_total - pedido.monto_pagado // pendiente
},
cuotas: [{
  moneda: 'PEN',
  monto: pedido.monto_total - pedido.monto_pagado,
  fechaPago: pedido.fecha_entrega_estimada
}]
```

### Backend: routes/pedidos.js

```
POST   /api/pedidos           — crear pedido (con primer pago si contra_entrega)
GET    /api/pedidos            — listar pedidos del usuario
GET    /api/pedidos/:id        — detalle con todos los pagos
PUT    /api/pedidos/:id        — actualizar estado, notas, fecha entrega
DELETE /api/pedidos/:id        — cancelar

POST   /api/pedidos/:id/pagos  — registrar pago (adelanto, parcial, restante)
POST   /api/pedidos/:id/entregar — marcar como entregado

GET    /api/pedidos/pendientes — vista rápida de pedidos con saldo pendiente
GET    /api/pedidos/hoy        — entregas del día
```

### Frontend: PedidosPage.jsx

- **Vista principal**: tabla/cards con pedidos activos
- **Summary cards**: Total pendiente, Entregas hoy, Pedidos esta semana
- **Filtros**: por estado, fecha, cliente
- **Modal crear pedido**: productos, cliente, tipo_pago (contado/contra_entrega), adelanto
- **Modal registrar pago**: monto, método, cuenta
- **Acción "Entregar"**: actualiza estado + opcional registrar pago restante

### Sidebar

```
Ventas
  Registro de ventas (existente)
  Pedidos / Contra entrega (NUEVO)
```

---

## FASE 3: MULTI-USUARIO POR NEGOCIO

### Objetivo
El dueño del negocio crea cuentas para sus empleados. Todos comparten los datos del negocio.

### BD: Tabla `empresas` + migración de `usuario_id` → `empresa_id`

```sql
CREATE TABLE empresas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  ruc VARCHAR(11),
  razon_social VARCHAR(300),
  nombre_comercial VARCHAR(200),
  direccion_fiscal TEXT,
  departamento VARCHAR(50),
  provincia VARCHAR(50),
  distrito VARCHAR(50),
  ubigeo VARCHAR(10),
  telefono VARCHAR(20),
  email VARCHAR(150),
  logo_url TEXT,
  
  -- Config que hoy vive en usuarios
  igv_rate NUMERIC(5,4) DEFAULT 0.18,
  tipo_negocio VARCHAR(10) DEFAULT 'formal',
  pais_code VARCHAR(5) REFERENCES paises(code),
  giro_negocio_id INTEGER REFERENCES giros_negocio(id),
  precio_decimales VARCHAR(10) DEFAULT 'variable',
  tarifa_mo_global NUMERIC(8,2),
  margen_minimo_global NUMERIC(5,2) DEFAULT 33,
  metodo_costeo VARCHAR(10) DEFAULT 'wac',
  
  -- Plan / suscripción
  plan VARCHAR(20) DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  max_productos INTEGER DEFAULT 2,
  max_usuarios INTEGER DEFAULT 3,
  
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nuevas columnas en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_empresa VARCHAR(20) DEFAULT 'owner';
```

### Migración incremental (NO romper nada)

```
PASO 1: Crear tabla empresas
PASO 2: Por cada usuario existente, crear una empresa
PASO 3: Agregar empresa_id a usuarios, backfill
PASO 4: Agregar empresa_id a TODAS las tablas de datos (26 tablas)
PASO 5: Backfill empresa_id en todas las tablas desde usuario_id
PASO 6: Actualizar queries gradualmente (endpoint por endpoint)
PASO 7: Agregar middleware de permisos por rol
PASO 8: UI: "Mi Equipo" para el owner
```

### Las 26 tablas que necesitan `empresa_id`

| # | Tabla | Prioridad |
|---|-------|-----------|
| 1 | insumos | Alta |
| 2 | materiales | Alta |
| 3 | preparaciones_predeterminadas | Alta |
| 4 | empaques_predeterminados | Alta |
| 5 | productos | Alta |
| 6 | periodos | Alta |
| 7 | transacciones | Alta |
| 8 | categorias_gasto | Alta |
| 9 | ventas | Alta |
| 10 | gastos | Alta |
| 11 | compras | Alta |
| 12 | clientes | Alta |
| 13 | pedidos (nuevo) | Alta |
| 14 | flujo_cuentas | Media |
| 15 | flujo_categorias | Media |
| 16 | flujo_arqueos | Media |
| 17 | flujo_transferencias | Media |
| 18 | facturacion_config | Media |
| 19 | comprobantes | Media |
| 20 | mediciones_merma_insumo | Baja |
| 21 | mediciones_merma_preparacion | Baja |
| 22 | desmedros_producto | Baja |
| 23 | desmedros_preparacion | Baja |
| 24 | desmedros_insumo | Baja |
| 25 | desmedros_material | Baja |
| 26 | ventas_periodo (legacy) | Baja |

### Permisos por rol

```
                    owner  manager  cashier  kitchen  viewer
productos.ver         ✓       ✓       ✓        ✓       ✓
productos.crear       ✓       ✓       ✗        ✗       ✗
productos.editar      ✓       ✓       ✗        ✗       ✗
productos.eliminar    ✓       ✗       ✗        ✗       ✗
ventas.ver            ✓       ✓       ✓        ✗       ✓
ventas.crear          ✓       ✓       ✓        ✗       ✗
ventas.editar         ✓       ✓       ✗        ✗       ✗
pedidos.ver           ✓       ✓       ✓        ✓       ✓
pedidos.crear         ✓       ✓       ✓        ✗       ✗
pedidos.entregar      ✓       ✓       ✓        ✗       ✗
financiero.ver        ✓       ✓       ✗        ✗       ✗
facturacion.emitir    ✓       ✓       ✓        ✗       ✗
equipo.gestionar      ✓       ✗       ✗        ✗       ✗
reportes.ver          ✓       ✓       ✗        ✗       ✓
```

### Flujo de invitación

```
1. Owner abre "Mi Equipo"
2. Click "Invitar"
3. Ingresa: email, nombre, rol
4. Sistema genera link de onboarding (reutiliza el sistema existente)
5. Empleado accede al link, crea contraseña
6. Se asocia automáticamente a la empresa del owner
7. Ve solo los módulos que su rol permite
```

### Impacto en auth

```javascript
// JWT token ahora incluye:
{
  id: userId,
  empresa_id: empresaId,
  rol_empresa: 'cashier',
  email: '...',
  igv_rate: 0.18  // viene de la empresa, no del usuario
}

// Middleware de permisos:
function requirePermiso(recurso, accion) {
  return (req, res, next) => {
    if (req.user.rol_empresa === 'owner') return next();
    // Check permisos matrix
    if (!tienePermiso(req.user.rol_empresa, recurso, accion)) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    next();
  };
}

// Uso:
router.post('/productos', requirePermiso('productos', 'crear'), async (req, res) => { ... });
```

---

## ORDEN DE IMPLEMENTACIÓN

```
FASE 1: Audit Trail (no rompe nada)
  ├── BD: audit_log + created_by columns
  ├── Backend: logAudit helper + integrar en rutas
  └── Frontend: página de actividad mejorada

FASE 2: Pedidos + Contra Entrega (funcionalidad nueva)
  ├── BD: pedidos + pagos_pedido + trigger
  ├── Backend: routes/pedidos.js
  ├── Frontend: PedidosPage + modal en ventas
  └── Integración: cash flow, facturación, clientes

FASE 3: Multi-Usuario (cambio arquitectural)
  ├── BD: empresas + migración empresa_id (26 tablas)
  ├── Backend: middleware permisos + actualizar queries
  ├── Frontend: "Mi Equipo" + flujo invitación
  └── Auth: JWT con empresa_id + rol_empresa
```

### Dependencias

```
Fase 1 ──→ Fase 2 (audit trail registra quién crea cada pedido)
Fase 1 ──→ Fase 3 (audit trail ya tiene created_by listo para multi-user)
Fase 2 ──→ Fase 3 (pedidos ya tiene created_by, solo se agrega empresa_id)
```

---

## RESUMEN DE CAMBIOS EN BD

### Tablas nuevas: 3
- `audit_log` (Fase 1)
- `pedidos` (Fase 2)
- `pagos_pedido` (Fase 2)
- `empresas` (Fase 3)

### Columnas nuevas en tablas existentes:
- `created_by` en 11 tablas (Fase 1)
- `empresa_id` en 26 tablas (Fase 3)
- `rol_empresa` + `empresa_id` en `usuarios` (Fase 3)

### Triggers: 1
- `trg_pagos_update` en pagos_pedido (auto monto_pagado)

### Indexes nuevos: ~35
- audit_log: 3
- pedidos: 3
- pagos_pedido: 1
- empresas: empresa por cada tabla de datos: 26

### Endpoints nuevos: ~12
- Fase 1: GET /audit-log
- Fase 2: CRUD pedidos (8 endpoints)
- Fase 3: CRUD equipo + permisos (4 endpoints)
