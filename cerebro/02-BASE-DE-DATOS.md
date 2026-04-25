# Base de Datos

**Container:** `cotizador-nodum-db` (PostgreSQL 16 Alpine)
**Database:** `cotizador_nodum`
**User:** `cotizador_user`
**Puerto externo:** 5437

## Tablas

### `usuarios`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt |
| rol | VARCHAR(20) | 'admin' o 'cliente' |
| estado | VARCHAR(20) | 'activo', 'inactivo', 'pendiente' |
| nombre | VARCHAR(255) | |
| dni | VARCHAR(8) UNIQUE | |
| ruc | VARCHAR(11) UNIQUE | |
| razon_social | VARCHAR(255) | |
| tipo_contribuyente | VARCHAR(30) | |
| nombre_comercial | VARCHAR(255) | Se muestra como "empresa" en frontend |
| igv_rate | NUMERIC(5,4) | Decimal: 0.18 = 18% |
| permisos | JSONB | Array de modulos habilitados |
| onboarding_token | VARCHAR(64) UNIQUE | Para registro de nuevos usuarios |
| onboarding_token_expires | TIMESTAMPTZ | |
| onboarding_completed_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

### `insumos`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| usuario_id | FK → usuarios | |
| nombre | VARCHAR(255) | |
| cantidad_presentacion | NUMERIC | Ej: 24 (unidades), 500 (gramos) |
| unidad_medida | VARCHAR | g, ml, uni, oz, kg, l |
| precio_presentacion | NUMERIC | Precio de la presentacion completa |
| estado | VARCHAR | 'activo' |
| created_at, updated_at | TIMESTAMPTZ | |

**Costo unitario** = precio_presentacion / cantidad_presentacion

### `materiales`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| usuario_id | FK → usuarios | |
| nombre | VARCHAR(255) | |
| proveedor | VARCHAR | Opcional |
| cantidad_presentacion | NUMERIC | |
| precio_presentacion | NUMERIC | |
| detalle | TEXT | Opcional |
| unidad_medida | VARCHAR | uni, g, ml, etc |
| estado | VARCHAR | 'activo' |
| created_at, updated_at | TIMESTAMPTZ | |

### `productos`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| usuario_id | FK → usuarios | |
| nombre | VARCHAR(255) | |
| margen | NUMERIC(5,4) | Decimal: 0.50 = 50% |
| igv_rate | NUMERIC(5,4) | Decimal: 0.18 = 18% |
| costo_insumos | NUMERIC(10,4) | Calculado |
| costo_empaque | NUMERIC(10,4) | Calculado |
| costo_neto | NUMERIC(10,4) | insumos + empaque |
| precio_venta | NUMERIC(10,4) | costo / (1 - margen) |
| precio_final | NUMERIC(10,4) | venta * (1 + igv) |
| imagen_url | TEXT | URL de imagen del producto |
| tipo_presentacion | VARCHAR(20) | 'unidad' o 'entero' |
| unidades_por_producto | INTEGER | Ej: 8 porciones |
| version_actual | INTEGER | |
| created_at, updated_at | TIMESTAMPTZ | |

### `producto_preparaciones`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| producto_id | FK → productos CASCADE | |
| nombre | VARCHAR(255) | Ej: "Masa galleta" |
| orden | INTEGER | Orden de display |
| capacidad | NUMERIC(12,4) | Rendimiento total (ej: 500) |
| unidad_capacidad | VARCHAR(20) | g, ml, kg, l, uni, oz |
| cantidad_por_unidad | NUMERIC(12,4) | Cuanto se usa para el producto completo |
| created_at | TIMESTAMPTZ | |

### `producto_prep_insumos`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| producto_preparacion_id | FK → producto_preparaciones CASCADE | |
| insumo_id | FK → insumos | |
| cantidad | NUMERIC | Cantidad de insumo usada |

### `producto_materiales`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| producto_id | FK → productos CASCADE | |
| material_id | FK → materiales | |
| cantidad | NUMERIC | |
| empaque_tipo | VARCHAR(10) | 'entero' o 'unidad' |

### `producto_versiones`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| producto_id | FK → productos CASCADE | |
| version | INTEGER | |
| snapshot_json | JSONB | Estado completo del producto |
| motivo | VARCHAR(50) | "Creacion inicial", "Edicion", etc |
| costo_neto | NUMERIC(10,4) | |
| precio_final | NUMERIC(10,4) | |
| created_at | TIMESTAMPTZ | |

### `actividad_log`
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | SERIAL PK | |
| usuario_id | FK → usuarios CASCADE | |
| entidad | VARCHAR(50) | 'insumo', 'material', 'producto' |
| entidad_id | INTEGER | ID de la entidad |
| accion | VARCHAR(30) | 'crear', 'actualizar', 'eliminar' |
| cambios_json | JSONB | Datos del cambio |
| created_at | TIMESTAMPTZ | |

### `preparaciones_predeterminadas` / `prep_pred_insumos`
Templates reutilizables de preparaciones.

### `empaques_predeterminados` / `empaque_pred_materiales`
Templates reutilizables de empaques.

## Migraciones

Las migraciones se ejecutan automaticamente al arrancar el servidor (`server/src/models/migrate.js`). Usan `ADD COLUMN IF NOT EXISTS` para ser idempotentes.
