# Esquema de Base de Datos - Cotizador Nodum

## Diagrama de relaciones

```
usuarios 1──N insumos
usuarios 1──N materiales
usuarios 1──N productos
usuarios 1──N preparaciones_predeterminadas
usuarios 1──N empaques_predeterminados
usuarios 1──N actividad_log

productos 1──N producto_preparaciones
productos 1──N producto_materiales
productos 1──N producto_versiones

producto_preparaciones 1──N producto_prep_insumos
producto_prep_insumos N──1 insumos

producto_materiales N──1 materiales

preparaciones_predeterminadas 1──N prep_pred_insumos
prep_pred_insumos N──1 insumos

empaques_predeterminados 1──N empaque_pred_materiales
empaque_pred_materiales N──1 materiales
```

## SQL Completo

```sql
-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USUARIOS
-- ============================================================
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol           VARCHAR(20) NOT NULL DEFAULT 'cliente',
    -- 'admin' | 'cliente'
  estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    -- 'pendiente' | 'activo' | 'suspendido'

  -- Datos personales (se llenan en onboarding)
  nombre            VARCHAR(255),
  dni               VARCHAR(8) UNIQUE,

  -- Datos del negocio
  ruc               VARCHAR(11) UNIQUE,
  razon_social      VARCHAR(255),
  tipo_contribuyente VARCHAR(30),
    -- 'persona_natural' | 'empresa'
  nombre_comercial  VARCHAR(255),

  -- Configuración fiscal
  igv_rate          DECIMAL(5,4) NOT NULL DEFAULT 0.1800,
    -- 0.1050 (restaurante MYPE) | 0.1800 (general)

  -- Onboarding
  onboarding_token          VARCHAR(64) UNIQUE,
  onboarding_token_expires  TIMESTAMPTZ,
  onboarding_completed_at   TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_dni ON usuarios(dni);
CREATE INDEX idx_usuarios_ruc ON usuarios(ruc);
CREATE INDEX idx_usuarios_onboarding_token ON usuarios(onboarding_token);

-- ============================================================
-- 2. INSUMOS (catálogo de ingredientes por usuario)
-- ============================================================
CREATE TABLE insumos (
  id                     SERIAL PRIMARY KEY,
  usuario_id             INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre                 VARCHAR(255) NOT NULL,
  cantidad_presentacion  DECIMAL(12,4) NOT NULL,
    -- ej: 345 (ml de un tarro de leche)
  unidad_medida          VARCHAR(20) NOT NULL,
    -- 'g' | 'ml' | 'uni' | 'oz' | 'kg' | 'l'
  precio_presentacion    DECIMAL(10,2) NOT NULL,
    -- ej: 3.80 (soles que pagó por el tarro)
  estado                 VARCHAR(20) NOT NULL DEFAULT 'activo',
    -- 'activo' | 'inactivo'

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(usuario_id, nombre)
);

CREATE INDEX idx_insumos_usuario ON insumos(usuario_id);
-- costo_unitario se calcula: precio_presentacion / cantidad_presentacion

-- ============================================================
-- 3. MATERIALES (catálogo de packaging por usuario)
-- ============================================================
CREATE TABLE materiales (
  id                     SERIAL PRIMARY KEY,
  usuario_id             INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre                 VARCHAR(255) NOT NULL,
  proveedor              VARCHAR(255),
  cantidad_presentacion  DECIMAL(12,4) NOT NULL,
    -- ej: 250 (unidades por paquete)
  precio_presentacion    DECIMAL(10,2) NOT NULL,
    -- ej: 277.00 (soles por el paquete)
  detalle                TEXT,
    -- ej: "Para box y sapitos"
  estado                 VARCHAR(20) NOT NULL DEFAULT 'activo',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(usuario_id, nombre)
);

CREATE INDEX idx_materiales_usuario ON materiales(usuario_id);
-- costo_unitario se calcula: precio_presentacion / cantidad_presentacion

-- ============================================================
-- 4. PREPARACIONES PREDETERMINADAS (recetas reutilizables)
-- ============================================================
CREATE TABLE preparaciones_predeterminadas (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre      VARCHAR(255) NOT NULL,
  -- costo se calcula dinámicamente desde sus insumos

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(usuario_id, nombre)
);

CREATE TABLE prep_pred_insumos (
  id                   SERIAL PRIMARY KEY,
  preparacion_pred_id  INT NOT NULL REFERENCES preparaciones_predeterminadas(id) ON DELETE CASCADE,
  insumo_id            INT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad             DECIMAL(12,4) NOT NULL,

  UNIQUE(preparacion_pred_id, insumo_id)
);

-- ============================================================
-- 5. EMPAQUES PREDETERMINADOS (sets de packaging reutilizables)
-- ============================================================
CREATE TABLE empaques_predeterminados (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre      VARCHAR(255) NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(usuario_id, nombre)
);

CREATE TABLE empaque_pred_materiales (
  id               SERIAL PRIMARY KEY,
  empaque_pred_id  INT NOT NULL REFERENCES empaques_predeterminados(id) ON DELETE CASCADE,
  material_id      INT NOT NULL REFERENCES materiales(id) ON DELETE RESTRICT,
  cantidad         DECIMAL(12,4) NOT NULL DEFAULT 1,

  UNIQUE(empaque_pred_id, material_id)
);

-- ============================================================
-- 6. PRODUCTOS (cotizaciones)
-- ============================================================
CREATE TABLE productos (
  id              SERIAL PRIMARY KEY,
  usuario_id      INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre          VARCHAR(255) NOT NULL,
  margen          DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
    -- 0.50 = 50% de margen
  igv_rate        DECIMAL(5,4) NOT NULL,
    -- hereda del usuario pero es editable por producto

  -- Costos calculados (se actualizan en cada save/recálculo)
  costo_insumos   DECIMAL(10,4) DEFAULT 0,
  costo_empaque   DECIMAL(10,4) DEFAULT 0,
  costo_neto      DECIMAL(10,4) DEFAULT 0,
  precio_venta    DECIMAL(10,4) DEFAULT 0,
  precio_final    DECIMAL(10,4) DEFAULT 0,

  version_actual  INT NOT NULL DEFAULT 1,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_productos_usuario ON productos(usuario_id);

-- ============================================================
-- 7. PRODUCTO_PREPARACIONES (N preparaciones por producto)
-- ============================================================
CREATE TABLE producto_preparaciones (
  id                SERIAL PRIMARY KEY,
  producto_id       INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre            VARCHAR(255) NOT NULL,
    -- "Masa", "Relleno", "Glaseado", etc.
  orden             INT NOT NULL DEFAULT 1,
  capacidad         DECIMAL(12,4),
    -- rendimiento de esta preparación
  unidad_capacidad  VARCHAR(20) DEFAULT 'g',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prod_prep_producto ON producto_preparaciones(producto_id);

-- ============================================================
-- 8. PRODUCTO_PREP_INSUMOS (N insumos por preparación)
-- ============================================================
CREATE TABLE producto_prep_insumos (
  id                        SERIAL PRIMARY KEY,
  producto_preparacion_id   INT NOT NULL REFERENCES producto_preparaciones(id) ON DELETE CASCADE,
  insumo_id                 INT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad                  DECIMAL(12,4) NOT NULL
    -- cantidad usada en la receta (en la unidad del insumo)
    -- costo = cantidad * (insumo.precio_presentacion / insumo.cantidad_presentacion)
);

CREATE INDEX idx_ppi_preparacion ON producto_prep_insumos(producto_preparacion_id);
CREATE INDEX idx_ppi_insumo ON producto_prep_insumos(insumo_id);

-- ============================================================
-- 9. PRODUCTO_MATERIALES (packaging del producto)
-- ============================================================
CREATE TABLE producto_materiales (
  id           SERIAL PRIMARY KEY,
  producto_id  INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  material_id  INT NOT NULL REFERENCES materiales(id) ON DELETE RESTRICT,
  cantidad     DECIMAL(12,4) NOT NULL DEFAULT 1
    -- siempre en unidades enteras para packaging
    -- costo = cantidad * (material.precio_presentacion / material.cantidad_presentacion)
);

CREATE INDEX idx_pm_producto ON producto_materiales(producto_id);
CREATE INDEX idx_pm_material ON producto_materiales(material_id);

-- ============================================================
-- 10. PRODUCTO_VERSIONES (historial de snapshots)
-- ============================================================
CREATE TABLE producto_versiones (
  id            SERIAL PRIMARY KEY,
  producto_id   INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  version       INT NOT NULL,
  snapshot_json JSONB NOT NULL,
    -- foto completa: preparaciones, insumos, materiales, costos
  motivo        VARCHAR(50) NOT NULL,
    -- 'creacion' | 'edicion' | 'recalculo_precio_insumo' | 'recalculo_precio_material'
  costo_neto    DECIMAL(10,4),
  precio_final  DECIMAL(10,4),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pv_producto ON producto_versiones(producto_id);

-- ============================================================
-- 11. ACTIVIDAD_LOG (auditoría general)
-- ============================================================
CREATE TABLE actividad_log (
  id           SERIAL PRIMARY KEY,
  usuario_id   INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  entidad      VARCHAR(50) NOT NULL,
    -- 'usuario' | 'insumo' | 'material' | 'producto' | 'preparacion_pred' | 'empaque_pred'
  entidad_id   INT NOT NULL,
  accion       VARCHAR(30) NOT NULL,
    -- 'crear' | 'editar' | 'eliminar' | 'recalcular' | 'onboarding'
  cambios_json JSONB,
    -- { campo: "precio_presentacion", anterior: 3.80, nuevo: 4.20 }

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_log_usuario ON actividad_log(usuario_id);
CREATE INDEX idx_log_entidad ON actividad_log(entidad, entidad_id);
CREATE INDEX idx_log_created ON actividad_log(created_at);
```

## Fórmulas de cálculo

```
costo_unitario_insumo = precio_presentacion / cantidad_presentacion
costo_unitario_material = precio_presentacion / cantidad_presentacion

costo_linea_insumo = cantidad_usada * costo_unitario_insumo
costo_linea_material = cantidad * costo_unitario_material

costo_preparacion = SUM(costo_linea_insumo) para todos los insumos de la preparación
costo_insumos = SUM(costo_preparacion) para todas las preparaciones del producto
costo_empaque = SUM(costo_linea_material) para todos los materiales del producto

costo_neto = costo_insumos + costo_empaque
precio_venta = costo_neto / (1 - margen)
precio_final = precio_venta * (1 + igv_rate)
```

## Notas de diseño

1. **ON DELETE RESTRICT** en insumo_id y material_id: no se puede borrar un insumo/material que esté en uso. Se debe hacer soft-delete (estado='inactivo').
2. **ON DELETE CASCADE** en producto_id: borrar un producto borra todas sus preparaciones, insumos, materiales y versiones.
3. **UNIQUE constraints** previenen duplicados por usuario.
4. **costo_unitario NO se almacena**: se calcula siempre como precio/cantidad para que al cambiar el precio, todo se actualice automáticamente.
5. **DECIMAL(10,4)** para costos y **DECIMAL(12,4)** para cantidades: precisión suficiente para fracciones pequeñas (ej: 0.00974 soles/gramo).
