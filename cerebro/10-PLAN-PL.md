# Plan Maestro — Sistema P&L (Profit & Loss)

> Estado de Resultados financiero integrado con el Cotizador Kudi
> Skills: `nodum-ui-designer`, `senior-backend`, `react-best-practices`

---

## Vision

Kudi pasa de ser un cotizador de productos a una **plataforma financiera completa** para MYPEs gastronomicas. El P&L permite al usuario saber no solo cuanto cuesta su producto, sino cuanto gana (o pierde) su negocio cada mes.

## Relacion con el Cotizador

```
COTIZADOR (fuente de verdad de costos)
    ↓
P&L (usa costos del cotizador + ventas reales + gastos)
    ↓
DECISIONES (que vender mas, que recortar, punto de equilibrio)
```

---

## FASE 1: Navegacion + Estructura Base
**Objetivo**: Reorganizar el sidebar en secciones colapsables y preparar la BD.
**Skills**: `nodum-ui-designer`, `react-best-practices`

### 1.1 Sidebar con secciones colapsables
- Agrupar modulos existentes bajo "Cotizador"
- Crear grupo "P&L" (vacio por ahora)
- Cada grupo se colapsa/expande con click
- Guardar estado en localStorage

### 1.2 Base de datos — tablas nuevas
```sql
-- Periodos contables (mes, semana, custom)
CREATE TABLE periodos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'mensual',  -- mensual, semanal, custom
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto', -- abierto, cerrado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categorias de gasto (personalizables por usuario)
CREATE TABLE categorias_gasto (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'fijo', -- fijo, variable
  icono VARCHAR(50),
  orden INTEGER NOT NULL DEFAULT 0,
  recurrente BOOLEAN NOT NULL DEFAULT false,
  monto_default NUMERIC(12,2),
  activa BOOLEAN NOT NULL DEFAULT true
);

-- Registro de ventas reales
CREATE TABLE ventas (
  id SERIAL PRIMARY KEY,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  fecha DATE NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,4) NOT NULL,
  descuento NUMERIC(12,4) DEFAULT 0,
  total NUMERIC(12,4) NOT NULL,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de gastos
CREATE TABLE gastos (
  id SERIAL PRIMARY KEY,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias_gasto(id),
  fecha DATE NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  descripcion TEXT,
  comprobante_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot del P&L por periodo (pre-calculado)
CREATE TABLE pl_snapshots (
  id SERIAL PRIMARY KEY,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  ingresos_brutos NUMERIC(12,2),
  descuentos NUMERIC(12,2),
  ingresos_netos NUMERIC(12,2),
  cogs_insumos NUMERIC(12,2),
  cogs_empaque NUMERIC(12,2),
  cogs_total NUMERIC(12,2),
  utilidad_bruta NUMERIC(12,2),
  gastos_fijos NUMERIC(12,2),
  gastos_variables NUMERIC(12,2),
  gastos_total NUMERIC(12,2),
  utilidad_operativa NUMERIC(12,2),
  impuestos NUMERIC(12,2),
  utilidad_neta NUMERIC(12,2),
  food_cost_pct NUMERIC(5,2),
  margen_bruto_pct NUMERIC(5,2),
  margen_neto_pct NUMERIC(5,2),
  data_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.3 Indices
```sql
CREATE INDEX idx_ventas_periodo ON ventas(periodo_id);
CREATE INDEX idx_ventas_producto ON ventas(producto_id);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_gastos_periodo ON gastos(periodo_id);
CREATE INDEX idx_gastos_categoria ON gastos(categoria_id);
CREATE INDEX idx_periodos_usuario ON periodos(usuario_id);
```

### 1.4 Categorias de gasto predeterminadas (seed)
Al crear usuario, insertar categorias base:
- Alquiler (fijo, recurrente)
- Planilla / Sueldos (fijo, recurrente)
- Servicios (luz, agua, gas) (fijo, recurrente)
- Marketing / Publicidad (variable)
- Delivery / Transporte (variable)
- Mantenimiento (variable)
- Software / Suscripciones (fijo, recurrente)
- Seguros (fijo, recurrente)
- Otros gastos (variable)

### Entregable Fase 1
- [x] Sidebar con secciones colapsables
- [x] Tablas creadas en BD
- [x] Categorias seed al crear usuario
- [x] Backend: CRUD periodos, categorias_gasto
- [x] Migracion automatica

---

## FASE 2: Registro de Ventas
**Objetivo**: Permitir registrar ventas reales vinculadas a productos del cotizador.
**Skills**: `nodum-ui-designer`, `senior-backend`, `react-best-practices`

### 2.1 Backend — endpoints ventas
```
POST   /api/pl/ventas          — registrar venta
GET    /api/pl/ventas?periodo=X — listar ventas del periodo
PUT    /api/pl/ventas/:id       — editar
DELETE /api/pl/ventas/:id       — eliminar
```

### 2.2 Frontend — pagina Ventas
- Selector de periodo (mes actual por defecto)
- Tabla de ventas: fecha, producto, cantidad, precio, descuento, total
- Boton "Registrar venta": modal con SearchableSelect de productos
  - Al seleccionar producto: auto-llena precio_unitario del cotizador
  - Cantidad editable
  - Descuento opcional
  - Total se calcula automaticamente
- Totales del periodo en la parte superior (cards)
- Mobile: cards con swipe para editar/eliminar

### 2.3 Integracion con Cotizador
- `producto_id` FK a productos existentes
- `precio_unitario` viene del producto pero es editable (puede haber promociones)
- COGS se calcula automaticamente: `costo_neto × cantidad`

### Entregable Fase 2
- [ ] CRUD ventas completo
- [ ] Pagina de ventas con tabla/cards
- [ ] Modal de registro de venta
- [ ] Calculo automatico de COGS

---

## FASE 3: Registro de Gastos
**Objetivo**: Permitir registrar gastos operativos por categoria.
**Skills**: `nodum-ui-designer`, `senior-backend`

### 3.1 Backend — endpoints gastos
```
POST   /api/pl/gastos           — registrar gasto
GET    /api/pl/gastos?periodo=X — listar gastos del periodo
PUT    /api/pl/gastos/:id       — editar
DELETE /api/pl/gastos/:id       — eliminar
GET    /api/pl/categorias       — listar categorias
POST   /api/pl/categorias       — crear categoria
PUT    /api/pl/categorias/:id   — editar
```

### 3.2 Frontend — pagina Gastos
- Selector de periodo
- Gastos agrupados por categoria (acordeon)
- Boton "Registrar gasto": modal con selector de categoria
- Gastos recurrentes: boton "Copiar del mes anterior" 
  - Copia todos los gastos recurrentes al periodo nuevo
- Gestion de categorias personalizables
- Resumen: total fijos vs variables (grafico dona)

### 3.3 Comprobantes
- Upload opcional de comprobante (imagen/PDF)
- Cloudinary para almacenamiento (ya configurado)

### Entregable Fase 3
- [ ] CRUD gastos completo
- [ ] Pagina de gastos agrupados por categoria
- [ ] Gastos recurrentes copiables
- [ ] Gestion de categorias

---

## FASE 4: Dashboard P&L
**Objetivo**: Generar y visualizar el Estado de Resultados automaticamente.
**Skills**: `nodum-ui-designer`, `react-best-practices`

### 4.1 Backend — calculo P&L
```
GET /api/pl/resumen?periodo=X — genera/retorna P&L del periodo
```

Calculo:
```
ingresos_brutos = SUM(ventas.total)
descuentos = SUM(ventas.descuento)
ingresos_netos = ingresos_brutos - descuentos

cogs_insumos = SUM(ventas.cantidad × producto.costo_insumos)
cogs_empaque = SUM(ventas.cantidad × producto.costo_empaque)
cogs_total = cogs_insumos + cogs_empaque

utilidad_bruta = ingresos_netos - cogs_total
food_cost_pct = (cogs_insumos / ingresos_netos) × 100

gastos_fijos = SUM(gastos WHERE categoria.tipo = 'fijo')
gastos_variables = SUM(gastos WHERE categoria.tipo = 'variable')
gastos_total = gastos_fijos + gastos_variables

utilidad_operativa = utilidad_bruta - gastos_total
impuestos = utilidad_operativa × igv_rate (si aplica)
utilidad_neta = utilidad_operativa - impuestos

margen_bruto_pct = (utilidad_bruta / ingresos_netos) × 100
margen_neto_pct = (utilidad_neta / ingresos_netos) × 100
```

### 4.2 Frontend — Dashboard P&L
Estilo Airbnb booking summary pero vertical:

```
┌─────────────────────────────────────┐
│  P&L — Enero 2026                    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐  │
│  │Ingr.│ │COGS │ │Gast.│ │Util. │  │
│  │43K  │ │14K  │ │16K  │ │ 5.7K │  │
│  └─────┘ └─────┘ └─────┘ └──────┘  │
│                                      │
│  Ingresos netos         S/ 43,000   │
│  ─────────────────────────────────  │
│  Costo de ventas       -S/ 14,400   │
│    Food cost: 30%                    │
│  ─────────────────────────────────  │
│  UTILIDAD BRUTA         S/ 28,600   │
│  ─────────────────────────────────  │
│  Gastos operativos     -S/ 16,300   │
│    Fijos: S/ 12,000                  │
│    Variables: S/ 4,300               │
│  ─────────────────────────────────  │
│  UTILIDAD NETA          S/ 5,700    │
│                                      │
│  [📊 Ver detalle]  [📥 Exportar]    │
└─────────────────────────────────────┘
```

### 4.3 KPIs (cards superiores)
- Food Cost % (con indicador verde/rojo: <35% verde, >35% rojo)
- Margen Bruto % 
- Punto de Equilibrio (ventas necesarias para cubrir gastos fijos)
- Ticket Promedio
- Producto mas vendido vs mas rentable

### 4.4 Graficos
- Barras: ingresos vs gastos por categoria
- Linea: tendencia mensual (si hay >1 periodo)
- Dona: distribucion de gastos

### Entregable Fase 4
- [ ] Endpoint de calculo P&L
- [ ] Dashboard con cards de KPIs
- [ ] Tabla de P&L estilo contable
- [ ] Graficos basicos (barras, dona)
- [ ] Exportar P&L a CSV/PDF

---

## FASE 5: Reportes y Comparativas
**Objetivo**: Comparar periodos, tendencias, y generar reportes profesionales.
**Skills**: `nodum-ui-designer`, `react-best-practices`

### 5.1 Comparacion mes a mes
- Selector: mes actual vs mes anterior
- Tabla comparativa con variaciones (+/- %)
- Graficos de tendencia (3-6-12 meses)

### 5.2 Analisis por producto
- Ranking de productos por ventas, por margen, por volumen
- Analisis ABC: A (80% ingresos), B (15%), C (5%)
- Productos que pierden dinero

### 5.3 Punto de equilibrio
- Calculo: gastos_fijos / margen_bruto_promedio
- Grafico visual: linea de costos fijos vs ingresos
- "Necesitas vender X unidades para cubrir gastos"

### 5.4 Exportar
- P&L en PDF profesional (con logo del usuario)
- CSV detallado para contadores
- Compartir por link (read-only)

### Entregable Fase 5
- [ ] Comparativa de periodos
- [ ] Analisis ABC de productos
- [ ] Punto de equilibrio visual
- [ ] Export PDF con branding

---

## FASE 6: Automatizacion y Recurrencia
**Objetivo**: Reducir la carga manual del usuario.

### 6.1 Gastos recurrentes automaticos
- Al crear un nuevo periodo, copiar gastos marcados como recurrentes
- Notificacion: "Se copiaron 6 gastos del mes anterior"

### 6.2 Metas mensuales
- Usuario define meta de utilidad neta
- Dashboard muestra progreso: "Vas al 60% de tu meta"
- Alerta si food cost supera el umbral

### 6.3 Integracion futura
- Conectar con POS (punto de venta) para ventas automaticas
- Conectar con bancos para gastos automaticos
- API publica para integraciones

---

## Notas tecnicas

### Skills a usar en CADA fase:
- `nodum-ui-designer` — para todo el frontend (Apple+Airbnb style)
- `senior-backend` — para API, DB, queries, seguridad
- `react-best-practices` — para performance, hooks, cache

### Principios:
- **Pre-calcular**: P&L se calcula al guardar/consultar, no en cada render
- **Batch endpoint**: `/api/pl/resumen` retorna todo de una vez
- **Periodos como contenedor**: todo se organiza por periodo
- **COGS automatico**: nunca se ingresa manualmente, viene del cotizador
- **Mobile-first**: todo funciona en celular

### Permisos:
- Modulo "P&L" se agrega a la lista de permisos por usuario
- Admin puede ver P&L de todos los usuarios
