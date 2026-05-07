# Bugs de Integración — 6 mayo 2026

> Bugs encontrados después de implementar Stock, Comisiones, Shopify y Ticket en una sola sesión.
> Estos bugs son de integración entre módulos — cada uno funciona aislado pero fallan al interactuar.

---

## BUG #1 — Ticket térmico: "Error generando ticket"

**Módulo:** Comprobantes → botón Ticket
**Causa:** Query en `ticket.js:20` referencia `vi.producto_nombre` que NO existe en tabla `venta_items`
**Error:** PostgreSQL 42703 "column does not exist"

**Fix:**
```sql
-- ANTES (línea 23):
COALESCE(vi.producto_nombre, p.nombre, 'Producto')

-- DESPUÉS:
COALESCE(p.nombre, 'Producto')
```

El JOIN con `productos p ON p.id = vi.producto_id` ya trae el nombre via `p.nombre`.

**También verificar:** Si el comprobante no tiene `venta_id` (emitido sin venta vinculada), el query devuelve items vacíos. Fallback a `detalle_json` del comprobante.

**Archivo:** `server/src/routes/ticket.js` línea 20-33

---

## BUG #2 — Contra entrega duplica montos en estado financiero

**Módulo:** Ventas → Contra Entrega → Estado de Resultados
**Problema:** Al vender S/20 contra entrega (S/10 adelanto + S/10 restante):
- Se registra 1 venta de S/20 (en transacciones)
- Se registra 1 pago adelanto de S/10 (en transacciones)
- Se registra 1 pago restante de S/10 (en transacciones)
- **Total aparente: S/40** cuando debería ser S/20

**Causa:** El flujo crea una transacción por la venta Y transacciones por cada pago del pedido. Los pagos son movimientos de cash flow, no ingresos adicionales.

**Fix:** Los pagos de pedidos (adelanto/restante) NO deben ser `tipo='venta'` en transacciones. Deben ser `tipo='pago_pedido'` o similar, y no sumarse a ingresos del P&L. Solo la venta original cuenta como ingreso.

**Archivos:** 
- `server/src/routes/pedidos.js` — INSERT transacciones en pagos
- `server/src/routes/pl.js` — GET /resumen debe filtrar `tipo='venta'` para ingresos, no incluir pagos

---

## BUG #3 — Rentabilidad muestra costos y precios en 0

**Módulo:** Catálogo → Rentabilidad
**Problema:** Los valores de costo_neto y precio_venta aparecen como 0 o con muchos decimales.
**Causa probable:** 
1. `parseFloat(p.costo_neto)` puede fallar si el valor viene como string con formato incorrecto
2. Los productos creados recientemente pueden no tener costos recalculados
3. `round2` no se aplica en el endpoint de analisis.js

**Fix:**
- En `analisis.js` GET /rentabilidad: aplicar `round2()` a todos los valores monetarios antes de retornar
- Verificar que `costo_neto` y `precio_venta` no son NULL en la BD
- Agregar fallback: si `costo_neto = 0` y el producto tiene insumos, recalcular

**Archivo:** `server/src/routes/analisis.js` líneas 73-115

---

## BUG #4 — Inventario no muestra productos al añadir entrada

**Módulo:** Catálogo → Inventario → botón "+ Entrada"
**Problema:** El modal de entrada de stock no muestra productos en el selector.
**Causa probable:** El selector carga productos con `control_stock=true`, pero ningún producto tiene esa flag activada aún. El usuario necesita primero activar control de stock en cada producto.

**Fix:** Dos opciones:
- **Opción A:** El modal muestra TODOS los productos (no solo los de control_stock), y al hacer entrada auto-activa control_stock
- **Opción B:** Mostrar un mensaje "Activa control de stock en tus productos primero" con link al cotizador

**Recomendación:** Opción A — menos fricción para el usuario.

**Archivo:** `client/src/pages/StockPage.jsx` — el SearchableSelect de productos en el modal

---

## BUG #5 — Compras de productos no actualizan inventario

**Módulo:** Finanzas → Compras → comprar producto terminado
**Problema:** Al registrar compra de 10 anillos, no aparecen en inventario.
**Causa probable:** 
1. El `registrarMovimiento` de stock.js se llama correctamente pero el producto no tiene `control_stock=true`
2. O el `producto_id` en compra_items no se procesa correctamente en pl.js
3. O el producto no tiene `empresa_id` correcto

**Fix:**
- En pl.js POST /compras: si un item tiene `producto_id`, auto-activar `control_stock=true` si no lo está
- Verificar que `registrarMovimiento` se importa y llama correctamente
- Agregar log para debugging

**Archivo:** `server/src/routes/pl.js` — POST /compras sección de producto_id

---

## BUG #6 — Decimales excesivos en módulos nuevos

**Módulo:** Varios (Rentabilidad, Comisiones, Stock)
**Problema:** Valores con 10+ decimales en la UI: "S/ 7.178500000000001"
**Causa:** `round2` se aplicó en calculador.js y productos.js pero NO en:
- analisis.js (rentabilidad)
- comisiones.js
- stock.js (subtotales)
- ticket.js

**Fix:** Aplicar `Math.round(x * 100) / 100` a todo valor monetario antes de retornar en:
- `analisis.js` — todos los campos de productos y resumen
- `comisiones.js` — monto_comision, base_comision
- `ticket.js` — precios en el HTML

**Patrón:** Crear un helper `r2(n)` en cada archivo o importar `round2` de calculador.js

---

## Orden de corrección recomendado

| # | Bug | Prioridad | Complejidad |
|---|-----|-----------|-------------|
| 1 | Ticket térmico | Alta | Baja (1 query fix) |
| 2 | Contra entrega duplica | Crítica | Media (lógica de pagos) |
| 3 | Rentabilidad en 0 | Alta | Baja (parseFloat + round2) |
| 4 | Stock sin productos | Alta | Baja (cambiar filtro) |
| 5 | Compras→Stock | Alta | Media (auto-enable + verificar) |
| 6 | Decimales | Media | Baja (round2 en 4 archivos) |

**Estrategia:** Corregir todos en una sola sesión con sub-agentes:
- Sub-agente A: Bugs 1 + 6 (ticket + decimales — archivos: ticket.js, analisis.js, comisiones.js)
- Sub-agente B: Bugs 2 + 3 (contra entrega + rentabilidad — archivos: pedidos.js, pl.js, analisis.js)
- Sub-agente C: Bugs 4 + 5 (stock — archivos: StockPage.jsx, pl.js, stock.js)
- Luego: tests E2E de cada módulo
