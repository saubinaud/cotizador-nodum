# Plan Maestro — Mermas + Ficha Técnica + Ajustes Globales

> Skills: `nodum-ui-designer`, `senior-backend`, `react-best-practices`
> Referencia: `09-DESIGN-SYSTEM.md`, `11-SISTEMA-FINANCIERO.md`

---

## ANÁLISIS DE IMPACTO EN BD EXISTENTE

### Columnas nuevas en tablas existentes:
```sql
-- insumos: añadir merma %
ALTER TABLE insumos ADD COLUMN merma_pct NUMERIC(5,2) DEFAULT 0;

-- productos: añadir campos ficha técnica
ALTER TABLE productos ADD COLUMN codigo VARCHAR(20);
ALTER TABLE productos ADD COLUMN categoria VARCHAR(100);
ALTER TABLE productos ADD COLUMN tiempo_activo_min INTEGER DEFAULT 0;
ALTER TABLE productos ADD COLUMN tiempo_reposo_min INTEGER DEFAULT 0;
ALTER TABLE productos ADD COLUMN tarifa_mo_hora NUMERIC(10,2);  -- NULL = usa global
ALTER TABLE productos ADD COLUMN cif_gas_unidad NUMERIC(10,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN cif_overhead_unidad NUMERIC(10,4) DEFAULT 0;
ALTER TABLE productos ADD COLUMN margen_minimo NUMERIC(5,2);    -- NULL = usa global
ALTER TABLE productos ADD COLUMN instrucciones_ensamble TEXT;

-- producto_preparaciones: añadir merma % e instrucciones
ALTER TABLE producto_preparaciones ADD COLUMN merma_pct NUMERIC(5,2) DEFAULT 0;
ALTER TABLE producto_preparaciones ADD COLUMN instrucciones TEXT;

-- usuarios: ajustes globales
ALTER TABLE usuarios ADD COLUMN tarifa_mo_hora NUMERIC(10,2) DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN margen_minimo NUMERIC(5,2) DEFAULT 33;
```

### Tablas nuevas:

```sql
-- ═══ MERMAS ═══

-- A. Merma de insumos (→ food cost)
CREATE TABLE merma_insumos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  merma_pct NUMERIC(5,2) NOT NULL,  -- % medido
  causa VARCHAR(100),               -- corte, pelado, cocción, etc.
  fecha DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B. Merma de preparación (→ food cost)
CREATE TABLE merma_preparaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  preparacion_pred_id INTEGER REFERENCES preparaciones_predeterminadas(id),
  producto_prep_id INTEGER REFERENCES producto_preparaciones(id),
  tanda_producida NUMERIC(12,4) NOT NULL,    -- g/ml producidos
  cantidad_usada NUMERIC(12,4) NOT NULL,     -- g/ml efectivamente usados
  cantidad_descartada NUMERIC(12,4) NOT NULL, -- g/ml perdidos
  merma_pct NUMERIC(5,2) NOT NULL,           -- calculado: (descartada/producida)*100
  causa VARCHAR(100),
  fecha DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- C. Merma de producto terminado (→ P&L gasto)
CREATE TABLE merma_productos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo_id INTEGER REFERENCES periodos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  unidades_producidas INTEGER NOT NULL,
  unidades_no_vendibles INTEGER NOT NULL,
  causa VARCHAR(50) NOT NULL,  -- quemado, roto, vencido, presentacion, otro
  costo_unitario NUMERIC(12,4) NOT NULL,  -- costo_neto al momento
  perdida_total NUMERIC(12,4) NOT NULL,   -- unidades_no_vendibles × costo_unitario
  fecha DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- D. Merma de materiales (→ P&L gasto)
CREATE TABLE merma_materiales (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo_id INTEGER REFERENCES periodos(id),
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  cantidad NUMERIC(12,4) NOT NULL,
  unidad VARCHAR(10),
  costo_unitario NUMERIC(12,4) NOT NULL,
  perdida_total NUMERIC(12,4) NOT NULL,
  causa VARCHAR(50) NOT NULL,  -- daño, vencimiento, error_pedido
  fecha DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- E. Merma de inventario (→ P&L gasto)
CREATE TABLE merma_inventario (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo_id INTEGER REFERENCES periodos(id),
  insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  cantidad NUMERIC(12,4) NOT NULL,
  unidad VARCHAR(10),
  costo_unitario NUMERIC(12,4) NOT NULL,
  perdida_total NUMERIC(12,4) NOT NULL,
  causa VARCHAR(50) NOT NULL,  -- vencimiento, contaminacion, error_stock
  fecha DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes:
```sql
CREATE INDEX idx_merma_ins_insumo ON merma_insumos(insumo_id);
CREATE INDEX idx_merma_ins_usuario ON merma_insumos(usuario_id);
CREATE INDEX idx_merma_prep_usuario ON merma_preparaciones(usuario_id);
CREATE INDEX idx_merma_prod_periodo ON merma_productos(periodo_id);
CREATE INDEX idx_merma_mat_periodo ON merma_materiales(periodo_id);
CREATE INDEX idx_merma_inv_periodo ON merma_inventario(periodo_id);
```

---

## FÓRMULAS DE CÁLCULO

### Merma de insumo → Food cost
```
cantidad_bruta = cantidad_neta / (1 - merma_pct/100)
costo_con_merma = cantidad_bruta × costo_base

Ejemplo:
  Necesito 100g de zanahoria, merma 15%
  Cantidad bruta = 100 / (1 - 0.15) = 117.6g
  Costo = 117.6g × S/0.002/g = S/0.2352
  (vs sin merma: 100g × S/0.002 = S/0.20)
```

### Merma de preparación → Food cost
```
costo_porcion_con_merma = costo_porcion / (1 - merma_prep_pct/100)

Ejemplo:
  Porción de masa cuesta S/2.00, merma prep 5%
  Costo real = S/2.00 / (1 - 0.05) = S/2.105
```

### Merma operativa → P&L
```
merma_operativa_mes = SUM(merma_productos.perdida_total)
                    + SUM(merma_materiales.perdida_total)
                    + SUM(merma_inventario.perdida_total)
```

### Ficha técnica — Costo neto completo
```
food_cost = SUM(ingredientes con merma) + SUM(mermas preparación) + empaque
costo_mo = (tiempo_activo_min / 60) × tarifa_mo / tamaño_tanda
costo_cif = cif_gas_unidad + cif_overhead_unidad
costo_neto = food_cost + costo_mo + costo_cif
margen_real = (precio_venta - costo_neto) / precio_venta × 100
precio_minimo = costo_neto / (1 - margen_minimo/100)
```

---

## PLAN DE IMPLEMENTACIÓN POR FASES

### FASE A: Ajustes globales + columnas BD (30 min)
**Skills:** `senior-backend`

1. Migración BD: añadir columnas a insumos, productos, producto_preparaciones, usuarios
2. Crear las 5 tablas de mermas
3. Endpoint PUT /api/auth/ajustes para tarifa_mo y margen_minimo
4. Frontend: sección "Ajustes" en Perfil con tarifa MO y margen mínimo

### FASE B: Módulo de mermas — Backend (45 min)
**Skills:** `senior-backend`

1. `server/src/routes/mermas.js` con CRUD para las 5 tablas
2. Endpoints:
   ```
   GET/POST/PUT/DELETE /api/mermas/insumos
   GET/POST/PUT/DELETE /api/mermas/preparaciones
   GET/POST/PUT/DELETE /api/mermas/productos
   GET/POST/PUT/DELETE /api/mermas/materiales
   GET/POST/PUT/DELETE /api/mermas/inventario
   GET /api/mermas/resumen?periodo_id=X  — totales por tipo
   ```
3. Auto-promedio de merma_pct en insumos al registrar nueva medición
4. Auto-cálculo de merma_pct en preparaciones
5. Registrar app.js

### FASE C: Módulo de mermas — Frontend (60 min)
**Skills:** `nodum-ui-designer`

1. Sidebar: nueva sección "Mermas" con 5 sub-links
2. 5 páginas (una por tipo) con:
   - Selector de periodo (para C, D, E)
   - Tabla/acordeón de registros
   - Modal de registro con campos específicos por tipo
   - Cards de resumen
3. Diseño: usar exactamente los mismos patrones de PLVentasPage/PLGastosPage

### FASE D: Integración merma → Food cost (45 min)
**Skills:** `senior-backend`, `react-best-practices`

1. En `useCalculadorCostos.js`: aplicar merma_pct de cada insumo
   ```js
   // Actual: costo = cantidad × costo_unitario
   // Nuevo:  costo = (cantidad / (1 - merma_pct/100)) × costo_unitario
   ```
2. En CotizadorPage: mostrar columna "Merma %" y "Cant. bruta" en tabla de insumos
3. Aplicar merma de preparación en la composición del producto
4. Recalcular automáticamente al cambiar merma

### FASE E: Ficha técnica — Backend + Frontend (90 min)
**Skills:** `nodum-ui-designer`, `senior-backend`

1. Endpoint `/api/productos/:id/ficha-tecnica` que retorna toda la data enriquecida
2. Nueva página/modal FichaTecnicaPage con las 10 secciones
3. Campos editables: tiempo_activo, tiempo_reposo, tarifa_mo, CIF, instrucciones
4. Campos calculados en verde: food cost, costo MO, costo CIF, costo neto, margen real
5. Alertas: banner rojo si precio < precio mínimo
6. Barra proporcional de desglose (food cost / MO / CIF)
7. Mobile: acordeón por sección

### FASE F: Integración mermas → P&L (30 min)
**Skills:** `senior-backend`

1. En `/api/pl/resumen`: añadir línea "Mermas operativas" con desglose
2. Query: SUM de merma_productos + merma_materiales + merma_inventario por periodo
3. Mostrar en el Estado de Resultados entre gastos operativos y utilidad operativa
4. Auto-crear categoría de gasto "Mermas operativas" si no existe

### FASE G: Export PDF ficha técnica (30 min)
**Skills:** `react-best-practices`

1. Botón "Exportar PDF" en ficha técnica
2. Generar HTML con estilos inline → window.print() / html2canvas + jsPDF
3. Incluir logo del usuario, todas las secciones, instrucciones
4. Diseño limpio para impresión

---

## DEPENDENCIAS ENTRE FASES

```
A (BD + ajustes) → B (backend mermas) → C (frontend mermas)
                                       → D (integración food cost)
A (BD) → E (ficha técnica)
B + E → F (P&L integración)
E → G (PDF export)
```

**Fases paralelas posibles:**
- B + E (backend mermas Y ficha técnica)
- C + D (frontend mermas Y integración food cost)

---

## IMPACTO EN CÓDIGO EXISTENTE

| Archivo | Cambio |
|---------|--------|
| `server/src/app.js` | Añadir mermasRoutes |
| `server/src/models/migrate.js` | 5 tablas + columnas nuevas |
| `server/src/routes/auth.js` | PUT /ajustes, incluir ajustes en /me |
| `client/src/hooks/useCalculadorCostos.js` | Aplicar merma_pct |
| `client/src/pages/CotizadorPage.jsx` | Mostrar merma %, cant. bruta |
| `client/src/components/Layout.jsx` | Sección Mermas en sidebar |
| `client/src/App.jsx` | 6+ rutas nuevas |
| `server/src/routes/pl.js` | Mermas en resumen P&L |

### NO se modifica:
- Tabla transacciones (mermas operativas van como gastos)
- SearchableSelect, CustomSelect, tokens
- Flujo de compras/ventas/gastos existente
- Sistema de temas, auth, permisos

---

## ESTIMACIÓN

| Fase | Tiempo | Agentes |
|------|--------|---------|
| A | 30 min | 1 |
| B | 45 min | 1 |
| C | 60 min | 2 (paralelo) |
| D | 45 min | 1 |
| E | 90 min | 2 (paralelo) |
| F | 30 min | 1 |
| G | 30 min | 1 |
| **Total** | **~5.5 horas** | |
