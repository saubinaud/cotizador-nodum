# Plan — Markup por Canal + Costo de Envío

---

## 1. MARKUP POR CANAL DE DISTRIBUCIÓN

### Concepto

Cada producto tiene un precio de tienda (ya existe). Para vender por plataformas de delivery,
el precio debe subir para cubrir la comisión de la plataforma.

```
Precio tienda: S/ 20.00 (margen 50%)
Rappi cobra: 30% comisión
→ Precio en Rappi = S/ 20.00 / (1 - 0.30) = S/ 28.57
→ El cliente paga S/ 28.57, Rappi se queda S/ 8.57, tú recibes S/ 20.00
```

### BD

```sql
-- Canales de distribución (configurables por usuario)
CREATE TABLE IF NOT EXISTS canales_distribucion (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,          -- 'Rappi', 'PedidosYa', 'Glovo', 'Tienda online'
  comision_pct NUMERIC(5,2) DEFAULT 0,   -- % que cobra la plataforma (30, 25, etc.)
  markup_tipo VARCHAR(10) DEFAULT 'pct',  -- 'pct' o 'fijo'
  markup_valor NUMERIC(10,2) DEFAULT 0,   -- % adicional o monto fijo que TÚ quieres ganar extra
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Precio por producto por canal (calculado o override manual)
CREATE TABLE IF NOT EXISTS producto_canal_precio (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  canal_id INTEGER NOT NULL REFERENCES canales_distribucion(id) ON DELETE CASCADE,
  precio_override NUMERIC(12,2),         -- NULL = auto-calculado, valor = override manual
  UNIQUE(producto_id, canal_id)
);
```

### Cálculo automático

```
precio_canal = precio_tienda / (1 - comision_pct/100)
// Si además tiene markup adicional:
precio_canal_final = precio_canal * (1 + markup_valor/100)  // si markup_tipo = 'pct'
precio_canal_final = precio_canal + markup_valor              // si markup_tipo = 'fijo'
```

### Endpoints

```
GET    /api/canales           — listar canales del usuario
POST   /api/canales           — crear canal { nombre, comision_pct, markup_tipo, markup_valor }
PUT    /api/canales/:id       — editar canal
DELETE /api/canales/:id       — eliminar canal

GET    /api/productos/:id/precios-canal  — precios calculados por canal
PUT    /api/productos/:id/precios-canal  — override manual de precio por canal
```

### UI

- **Dashboard de productos**: mostrar precio de tienda + mini badges con precio por canal
- **Ficha técnica**: sección "Precios por canal" con tabla
- **Config**: página "Canales de distribución" en sección Cotizador o Configuración

---

## 2. COSTO DE ENVÍO EN VENTAS

### BD

```sql
-- Zonas de envío configurables
CREATE TABLE IF NOT EXISTS zonas_envio (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,            -- 'Zona 1 - Centro', 'Zona 2 - Cono Norte'
  costo NUMERIC(10,2) NOT NULL DEFAULT 0,  -- costo predefinido
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columnas nuevas en ventas/transacciones
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_envio VARCHAR(20);          -- 'sin_envio', 'propio', 'aplicacion'
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(10,2) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS zona_envio_id INTEGER REFERENCES zonas_envio(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS direccion_envio TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS canal_id INTEGER REFERENCES canales_distribucion(id);

-- También en pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_envio VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(10,2) DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS zona_envio_id INTEGER REFERENCES zonas_envio(id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_envio TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS canal_id INTEGER REFERENCES canales_distribucion(id);
```

### Flujo en la UI de ventas

```
Al registrar venta:
  1. Seleccionar producto, cantidad, precio
  2. ¿Tiene envío? [toggle]
     Si sí:
       - Tipo: [Envío propio] [Aplicación]
       - Canal (si es aplicación): [Rappi] [PedidosYa] [otro]
       - Zona: [dropdown de zonas con costo predefinido]
       - Costo envío: [auto-llenado de zona, editable]
       - Dirección: [texto, auto-completa del cliente]
  3. Costo envío se suma al total de la venta
  4. En la transacción del cash flow, el envío se registra como parte del ingreso
```

### Endpoints

```
GET    /api/zonas-envio       — listar zonas
POST   /api/zonas-envio       — crear zona
PUT    /api/zonas-envio/:id   — editar
DELETE /api/zonas-envio/:id   — eliminar
```

---

## 3. DIRECCIÓN DE ENTREGA EN CLIENTES

### BD

```sql
-- Ya existe dirección en clientes, agregar campos extra
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion_referencia TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS distrito_envio VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS zona_envio_id INTEGER REFERENCES zonas_envio(id);
```

### UI

- En el catálogo de clientes: campos adicionales de dirección
- Al seleccionar cliente en venta: auto-completa dirección y zona de envío

---

## FASES

### Fase A: Canales de distribución (backend + frontend)
- BD: canales_distribucion + producto_canal_precio
- Backend: CRUD canales + precios por canal
- Frontend: página canales + precios en ficha técnica/dashboard

### Fase B: Zonas de envío + envío en ventas
- BD: zonas_envio + columnas en ventas/pedidos
- Backend: CRUD zonas + actualizar POST ventas/pedidos
- Frontend: toggle envío en formulario de ventas

### Fase C: Dirección en clientes
- BD: columnas en clientes
- Frontend: campos extra en catálogo clientes + auto-complete en ventas
