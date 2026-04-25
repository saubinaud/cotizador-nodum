# Logica del Cotizador

## Flujo de costeo

```
PREPARACIONES → COMPOSICION → EMPAQUE → COSTOS → PRECIO
```

### Paso 1: Preparaciones
Cada preparacion es una receta base con:
- Nombre (ej: "Masa galleta")
- Rendimiento total (ej: 1000g)
- Lista de insumos con cantidades

**Costo de la preparacion** = suma de (costo_unitario_insumo × cantidad_usada)

Donde `costo_unitario_insumo = precio_presentacion / cantidad_presentacion`

### Paso 2: Composicion del producto
Define cuanto de cada preparacion se usa para hacer UN PRODUCTO COMPLETO:
- Masa galleta: uso 800g de los 1000g que rinde
- Relleno: uso 400g de los 500g que rinde

**Costo de la preparacion para el producto** = (costo_prep / rendimiento) × cantidad_para_producto

**Productos por tanda** = rendimiento / cantidad_para_producto (cuantos productos hago con una tanda)

Si no se definen porciones: se usa el costo completo de la preparacion (backward compatible).

### Paso 3: Tipos de presentacion

**Por unidad** (ej: una galleta individual):
- Costo del producto = suma de costos de preparaciones
- Empaque = solo empaque "entero"

**Producto entero** (ej: torta de 8 porciones):
- Costo del producto = suma de costos de preparaciones
- Costo por porcion = costo_producto / unidades_por_producto
- Empaque separado: "entero" para el producto + "unidad" para cada porcion

### Paso 4: Calculo de precios

```
costoInsumosProducto = SUM(costo_prep / rendimiento × cantidad_para_producto)

// Para producto entero:
costoEmpaque = costoEmpaqueEntero + (costoEmpaqueUnidad × numPorciones)
costoNeto = costoInsumosProducto + costoEmpaque
precioVenta = costoNeto / (1 - margen)
precioFinal = precioVenta × (1 + igvRate)

// Precio por porcion:
costoNetoPorcion = (costoInsumosProducto / numPorciones) + costoEmpaqueUnidad
precioFinalPorcion = costoNetoPorcion / (1 - margen) × (1 + igvRate)
```

### Paso 5: Redondeo comercial

```javascript
function precioComercial(precio) {
  const entero = Math.floor(precio);
  const centavos = precio - entero;
  if (centavos <= 0.05) return entero || 0.90;
  if (centavos <= 0.90) return entero + 0.90;
  return entero + 1;
}
// 34.09 → 34.90
// 34.91 → 35.00
// 5.23 → 5.90
```

## Ejemplo completo

**Producto: Cheesecake (entero, 8 porciones)**

Preparaciones:
- Masa galleta: rinde 1000g, cuesta S/ 15.00
  - Uso para el producto: 800g → costo = (15/1000) × 800 = S/ 12.00
- Relleno: rinde 500g, cuesta S/ 10.00
  - Uso para el producto: 500g → costo = (10/500) × 500 = S/ 10.00

Empaque:
- Caja grande (entero): S/ 2.00
- Cajita porcion (unidad): S/ 0.30 × 8 = S/ 2.40

```
Costo insumos producto: S/ 22.00
Empaque producto:       S/  2.00
Empaque porciones:      S/  2.40
Costo neto:             S/ 26.40
Margen 50%:             
Precio venta:           S/ 52.80
IGV 18%:                S/  9.50
Precio final:           S/ 62.30
Precio sugerido:        S/ 62.90

POR PORCION (1/8):
Costo:                  S/  3.05
Precio final:           S/  7.19
Precio sugerido:        S/  7.90
```

## Versionado

Cada vez que se guarda un producto, se crea una version en `producto_versiones` con:
- `snapshot_json`: estado completo del producto en ese momento
- `motivo`: "Creacion inicial", "Edicion de producto", "Restaurado a version X"
- Se puede restaurar cualquier version anterior (crea una nueva version al restaurar)

## Recalculo automatico

Cuando se edita el precio de un insumo o material:
- El backend busca todos los productos que lo usan
- Recalcula los costos y crea una nueva version con motivo "Cambio de precio de insumo/material"
