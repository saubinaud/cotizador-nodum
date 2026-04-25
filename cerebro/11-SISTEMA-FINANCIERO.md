# Sistema Financiero Kudi — Arquitectura Actual

## Modelo de datos unificado

```
transacciones (tabla central)
  ├── tipo: 'venta' | 'compra' | 'gasto' | 'ingreso_otro'
  ├── monto: positivo=ingreso, negativo=egreso
  ├── monto_absoluto: siempre positivo
  ├── fecha + periodo_id (auto-detectado)
  ├── producto_id (ventas)
  ├── categoria_id (gastos)
  ├── compra_id → compras → compra_items (compras con items)
  └── descuento_tipo/valor (ventas: none/total/unit/percent)

periodos
  ├── mensual/semanal/custom
  └── abierto/cerrado

categorias_gasto
  ├── tipo: fijo/variable
  ├── recurrente: boolean
  └── monto_default (para auto-seed)

compras → compra_items
  ├── insumo_id o material_id (del catalogo)
  ├── cantidad + unidad + precio_unitario
  └── variacion vs precio catalogo

Legacy (backward compatible):
  ventas, gastos (INSERT dual al crear transaccion)
```

## Endpoints API

```
/api/pl/transacciones          GET  — timeline con filtros
/api/pl/transacciones          POST — crear cualquier tipo
/api/pl/transacciones/balance  GET  — resumen rapido
/api/pl/transacciones/:id      DELETE

/api/pl/periodos               CRUD
/api/pl/categorias             CRUD

/api/pl/ventas                 CRUD (legacy)
/api/pl/ventas/resumen         GET

/api/pl/gastos                 CRUD (legacy)
/api/pl/gastos/resumen         GET
/api/pl/gastos/copiar-recurrentes POST

/api/pl/compras                CRUD
/api/pl/compras/resumen        GET

/api/pl/resumen                GET — P&L completo con KPIs
```

## Paginas frontend

```
/pl              — Timeline (vista banco, transacciones por fecha)
/pl/resumen      — Estado de Resultados (P&L contable profesional)
/pl/ventas       — Gestion detallada de ventas
/pl/compras      — Registro de compras con items
/pl/gastos       — Gastos por categoria con recurrentes
```

## Flujo de datos para P&L

```
1. Usuario registra transacciones (timeline o paginas individuales)
2. /api/pl/resumen calcula todo on-demand:
   - Ingresos = SUM(transacciones WHERE tipo='venta')
   - COGS teorico = SUM(ventas.cantidad × producto.costo_neto)
   - COGS real = SUM(compra_items.total)
   - Gastos = SUM(transacciones WHERE tipo='gasto')
   - Utilidad = Ingresos - COGS - Gastos - Impuestos
3. KPIs: food cost %, margen bruto/neto %, punto equilibrio, ticket promedio
```

## Preparado para cashflow

La tabla transacciones con monto (con signo) + fecha permite:
- Cashflow diario/semanal/mensual
- Proyeccion de flujo de caja
- Balance acumulado por periodo
- Alertas de liquidez

## Fases implementadas

- [x] Fase 1: BD + Sidebar colapsable + CRUD periodos/categorias
- [x] Fase 2: Registro de ventas con descuentos inteligentes
- [x] Fase 3: Registro de gastos por categoria + recurrentes
- [x] Fase 4: Dashboard P&L con KPIs + estado de resultados contable
- [x] Fase 4.5: Compras con items + COGS real vs teorico
- [x] Fase 4.6: Transacciones unificadas + Timeline banking-style
- [ ] Fase 5: Reportes comparativos + analisis ABC + PDF
- [ ] Fase 6: Cashflow + metas + automatizacion
