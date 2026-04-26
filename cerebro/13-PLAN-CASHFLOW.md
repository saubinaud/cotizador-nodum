# Plan Maestro — Mi Plata (Flujo de Caja)

> Skills: `nodum-ui-designer`, `senior-backend`
> Referencia: `11-SISTEMA-FINANCIERO.md`, `09-DESIGN-SYSTEM.md`

---

## CONCEPTO

"Mi Plata" es el módulo de flujo de caja de Kudi. Responde la pregunta que todo dueño de MYPE se hace: **"¿Cuánta plata tengo y me alcanza para la compra del viernes?"**

No es un estado de flujo de caja contable (3 secciones). Es una herramienta visual, diaria, forward-looking que usa los datos existentes de `transacciones`.

### Diferencia con P&L

| P&L (ya existe) | Mi Plata (nuevo) |
|---|---|
| "¿Soy rentable?" | "¿Cuánta plata tengo HOY?" |
| Base devengado | Base efectivo |
| Mensual | Diario/semanal |
| Mira al pasado | Mira al futuro |

---

## DATOS EXISTENTES QUE ALIMENTAN EL CASHFLOW

La tabla `transacciones` con su `monto` con signo y `fecha` **ya es un libro de caja**:

- `monto > 0` → ingreso (ventas)
- `monto < 0` → egreso (compras, gastos)
- `fecha` → cuándo se movió la plata
- `periodo_id` → agrupa por mes

### Lo que falta (mínimo)

| Dato | Tabla | Tipo | Descripción |
|---|---|---|---|
| `saldo_inicial` | `periodos` | NUMERIC(12,2) DEFAULT 0 | "Empecé el mes con S/ X" |
| `metodo_pago` | `transacciones` | VARCHAR(20) DEFAULT 'efectivo' | efectivo/yape/plin/transferencia/tarjeta |

---

## DISEÑO UX (Investigación aplicada)

### Layout principal

```
┌──────────────────────────────────────────────┐
│ Hero: "Tienes S/ 12,450 disponible"          │
│ [↑ +8.2% vs semana pasada]                  │
├──────────────┬───────────────────────────────┤
│ Card:        │ Card:                         │
│ Entradas     │ Salidas                       │
│ S/ 8,200     │ S/ 5,100                      │
├──────────────┴───────────────────────────────┤
│ Toggle: [Entradas/Salidas] | [Saldo]         │
│                                              │
│ ████          ░░░░   ← barras (actual/proy)  │
│ ████ ████     ░░░░ ░░░░                      │
│ ████ ████ ████░░░░ ░░░░ ░░░░                │
│ ___________________________                  │
│ Lun  Mar  Mié  Jue  Vie  Sáb  Dom           │
│ ← actual →    ← proyección →                │
│                                              │
│ Tiempo: [7d] [15d] [30d]                    │
├──────────────────────────────────────────────┤
│ Métricas rápidas                             │
│ • Venta promedio/día: S/ 780                 │
│ • Te alcanza para: ~18 días                  │
│ • Ratio caja: 1.3x (sano)                   │
├──────────────────────────────────────────────┤
│ Simulador: "¿Me alcanza?"                    │
│ [Monto: S/ ____] [Fecha: ___]  [Simular]    │
│ → Resultado inline con balance proyectado    │
├──────────────────────────────────────────────┤
│ Movimientos recientes                        │
│ ● Venta almuerzo      +S/ 1,200       Hoy   │
│ ○ Compra insumos      -S/ 450        Ayer    │
│ ● Catering evento     +S/ 3,500       Lun   │
└──────────────────────────────────────────────┘
```

### Colores (NO rojo para egresos)

| Elemento | Color | Razón |
|---|---|---|
| Entradas | `emerald-500` (#10b981) | Positivo, dinero que entra |
| Salidas | `stone-400` (#a8a29e) | Neutral, no genera ansiedad |
| Saldo (línea) | `stone-800` | Prominente pero sobrio |
| Proyecciones | Mismo color + `opacity-40` + dashed | Diferencia visual sutil |
| Alerta negativa | `rose-500` | Solo cuando el saldo proyectado es < 0 |

### Health indicators (dots)

- `emerald-500` ● → sano (ratio > 1.2, runway > 15 días)
- `amber-500` ● → atención (ratio 0.8-1.2, runway 7-15 días)
- `rose-500` ● → crítico (ratio < 0.8, runway < 7 días)

---

## QUERIES SQL OPTIMIZADOS

### Q1: Balance diario con acumulado (window function + generate_series)

```sql
WITH periodo AS (
  SELECT id, fecha_inicio, fecha_fin, saldo_inicial
  FROM periodos WHERE id = $1
),
dias AS (
  SELECT d::date AS fecha
  FROM periodo p, generate_series(p.fecha_inicio, p.fecha_fin, '1 day'::interval) d
),
diario AS (
  SELECT
    t.fecha,
    SUM(CASE WHEN t.monto > 0 THEN t.monto ELSE 0 END) AS entradas,
    SUM(CASE WHEN t.monto < 0 THEN ABS(t.monto) ELSE 0 END) AS salidas,
    SUM(t.monto) AS neto
  FROM transacciones t
  WHERE t.periodo_id = $1
  GROUP BY t.fecha
)
SELECT
  d.fecha,
  COALESCE(di.entradas, 0) AS entradas,
  COALESCE(di.salidas, 0) AS salidas,
  COALESCE(di.neto, 0) AS neto,
  p.saldo_inicial + SUM(COALESCE(di.neto, 0)) OVER (
    ORDER BY d.fecha ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS balance_acumulado
FROM dias d
CROSS JOIN periodo p
LEFT JOIN diario di ON di.fecha = d.fecha
ORDER BY d.fecha;
```

### Q2: Semanal (ISO weeks)

```sql
-- Similar a Q1 pero con DATE_TRUNC('week', t.fecha) y TO_CHAR(t.fecha, 'IYYY-"W"IW')
```

### Q3: Proyección 30 días

```sql
-- Usa promedio_diario_ventas (últimos 30d) + gastos_recurrentes (categorias_gasto.recurrente)
-- Genera serie de días futuros con generate_series
-- Running balance = balance_actual + SUM(ingreso_proyectado - gasto_proyectado) OVER(...)
```

### Q4: Simulador "¿Me alcanza?"

```sql
-- Doble track: balance_sin_compra vs balance_con_compra
-- Muestra en qué fecha el saldo se vuelve negativo
-- Calcula días_para_recuperar = monto_compra / neto_diario
```

### Q5: Métricas de velocidad

```sql
-- velocidad_ingreso_diaria, velocidad_gasto_diaria
-- ratio_caja (entradas/salidas, >1 es sano)
-- dias_hasta_cero (burn rate)
-- ingreso_promedio, gasto_promedio
```

### Index recomendado

```sql
CREATE INDEX idx_transacciones_cashflow
  ON transacciones (periodo_id, fecha) INCLUDE (monto);
```

---

## FASES DE IMPLEMENTACIÓN

### FASE A: BD + Backend core (1 columna + 3 endpoints)

**BD:**
```sql
ALTER TABLE periodos ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(12,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_transacciones_cashflow ON transacciones (periodo_id, fecha) INCLUDE (monto);
```

**Endpoints en `pl.js`:**
1. `GET /api/pl/cashflow?periodo_id=X` → Q1 (diario) + resumen
2. `GET /api/pl/cashflow/metricas?periodo_id=X` → Q5 (velocidad, ratio, runway)
3. `PUT /api/pl/periodos/:id/saldo-inicial` → actualizar saldo inicial

### FASE B: Frontend "Mi Plata" — Vista principal

**Archivo:** `client/src/pages/PLCashflowPage.jsx`

- Hero card: saldo actual (grande, bold)
- 2 cards: entradas / salidas del período
- Gráfico de barras (entradas verde, salidas stone) con toggle a línea de balance
- Selector de tiempo: 7d / 15d / 30d (pills)
- Selector de período (CustomSelect, mismo que otras páginas P&L)
- Input de saldo inicial con guardado inline
- Lista de movimientos recientes (últimas 10 transacciones)

### FASE C: Proyecciones

**Endpoint:** `GET /api/pl/cashflow/proyeccion?periodo_id=X`

- Barras proyectadas con opacity-40
- Línea de balance dashed para futuro
- Métricas: promedio diario ventas, días de runway, ratio caja
- Health dots (verde/ámbar/rojo)

### FASE D: Simulador "¿Me alcanza?"

**Endpoint:** `GET /api/pl/cashflow/simulacion?periodo_id=X&monto=2500&fecha=2026-05-01`

- Card expandible en la página
- Input: monto + fecha
- Resultado: balance antes/después, días para recuperar, veredicto
- Visual: mini gráfico con línea "sin compra" vs "con compra"

### FASE E: Método de pago + breakdown

```sql
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20) DEFAULT 'efectivo';
```

- Breakdown por método de pago (pie chart o cards)
- "¿Cuánto tengo en efectivo vs digital?"
- Quick-add de método de pago en el timeline

### FASE F: Patrones y alertas

- Análisis día de la semana (¿cuándo vendes más? ¿cuándo gastas más?)
- Brechas de ingreso (rachas de días sin venta)
- Alertas push: "Tu saldo será negativo en 5 días"

---

## DEPENDENCIAS

```
A (BD + endpoints) → B (frontend vista)
A → C (proyecciones)
B + C → D (simulador)
A → E (método pago)
C → F (alertas)
```

**Paralelo posible:** B + C (frontend vista + proyecciones)

---

## SIDEBAR

```
P&L
  Timeline
  Ventas
  Compras
  Gastos
  Estado de resultados
  Mi Plata  ← NUEVO
```

---

## IMPACTO EN CÓDIGO

| Archivo | Cambio |
|---|---|
| `server/src/models/migrate.js` | 1 columna + 1 index |
| `server/src/routes/pl.js` | 4-5 endpoints nuevos |
| `client/src/pages/PLCashflowPage.jsx` | NUEVO |
| `client/src/components/Layout.jsx` | Link en sidebar P&L |
| `client/src/App.jsx` | Ruta `/pl/cashflow` |

### NO se modifica:
- Tabla transacciones (solo se lee, no se escribe)
- Flujo de ventas/compras/gastos existente
- P&L resumen
- Sistema de temas, auth, permisos
