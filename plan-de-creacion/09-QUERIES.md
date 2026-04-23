# Queries por Endpoint - Cotizador Nodum

## AUTH

### POST /api/auth/login
```sql
SELECT id, email, password_hash, nombre, rol, estado, igv_rate, nombre_comercial
FROM usuarios
WHERE email = $1 AND estado = 'activo';
-- Luego: bcrypt.compare(password, password_hash)
-- Si ok: generar JWT { id, email, rol, igv_rate }
```

### POST /api/auth/cambiar-password
```sql
UPDATE usuarios
SET password_hash = $2, updated_at = NOW()
WHERE id = $1;
```

---

## ADMIN

### POST /api/admin/usuarios (crear usuario)
```sql
INSERT INTO usuarios (email, password_hash, rol, estado, onboarding_token, onboarding_token_expires, created_at, updated_at)
VALUES ($1, $2, 'cliente', 'pendiente', $3, NOW() + INTERVAL '48 hours', NOW(), NOW())
RETURNING id, email, onboarding_token;
-- $2 = bcrypt(contraseña temporal)
-- $3 = crypto.randomBytes(32).toString('hex')
```

### GET /api/admin/usuarios (listar)
```sql
SELECT id, email, nombre, nombre_comercial, ruc, razon_social,
       tipo_contribuyente, igv_rate, estado,
       created_at, onboarding_completed_at
FROM usuarios
WHERE rol = 'cliente'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
```

### PATCH /api/admin/usuarios/:id/suspender
```sql
UPDATE usuarios SET estado = 'suspendido', updated_at = NOW()
WHERE id = $1 AND rol = 'cliente'
RETURNING id, email, estado;
```

### PATCH /api/admin/usuarios/:id/reactivar
```sql
UPDATE usuarios SET estado = 'activo', updated_at = NOW()
WHERE id = $1 AND rol = 'cliente'
RETURNING id, email, estado;
```

---

## ONBOARDING

### GET /api/onboarding/validar?token=xxx
```sql
SELECT id, email, estado, onboarding_token_expires
FROM usuarios
WHERE onboarding_token = $1
  AND estado = 'pendiente'
  AND onboarding_token_expires > NOW();
-- Si no hay resultado: token inválido o expirado
```

### GET /api/onboarding/consulta-ruc/:ruc
```javascript
// Llama a PeruAPI
// GET https://api.peruapi.com/ruc/{ruc}
// Headers: Authorization: Bearer {PERUAPI_KEY}
// Respuesta: { ruc, razonSocial, tipoContribuyente, estado, direccion }
```

### POST /api/onboarding/completar
```sql
UPDATE usuarios SET
  nombre = $1,
  dni = $2,
  ruc = $3,
  razon_social = $4,
  tipo_contribuyente = $5,
  nombre_comercial = $6,
  igv_rate = $7,
  password_hash = $8,
  estado = 'activo',
  onboarding_token = NULL,
  onboarding_token_expires = NULL,
  onboarding_completed_at = NOW(),
  updated_at = NOW()
WHERE id = $9 AND onboarding_token = $10 AND estado = 'pendiente'
RETURNING id, email, nombre, nombre_comercial, igv_rate;
-- $7 = 0.1050 o 0.1800
-- $8 = bcrypt(nueva contraseña)
```

---

## INSUMOS

### GET /api/insumos (listar del usuario)
```sql
SELECT id, nombre, cantidad_presentacion, unidad_medida, precio_presentacion,
       ROUND(precio_presentacion / cantidad_presentacion, 6) AS costo_unitario,
       estado, updated_at
FROM insumos
WHERE usuario_id = $1 AND estado = 'activo'
ORDER BY nombre ASC;
```

### POST /api/insumos (crear)
```sql
INSERT INTO insumos (usuario_id, nombre, cantidad_presentacion, unidad_medida, precio_presentacion, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
RETURNING id, nombre, cantidad_presentacion, unidad_medida, precio_presentacion,
          ROUND(precio_presentacion / cantidad_presentacion, 6) AS costo_unitario;
```

### PUT /api/insumos/:id (editar)
```sql
-- 1. Obtener valores anteriores (para log)
SELECT nombre, cantidad_presentacion, precio_presentacion
FROM insumos WHERE id = $1 AND usuario_id = $2;

-- 2. Actualizar
UPDATE insumos SET
  nombre = $3,
  cantidad_presentacion = $4,
  unidad_medida = $5,
  precio_presentacion = $6,
  updated_at = NOW()
WHERE id = $1 AND usuario_id = $2
RETURNING id, nombre, cantidad_presentacion, unidad_medida, precio_presentacion,
          ROUND(precio_presentacion / cantidad_presentacion, 6) AS costo_unitario;

-- 3. Si cambió precio o cantidad → buscar productos afectados
SELECT DISTINCT p.id, p.nombre
FROM productos p
JOIN producto_preparaciones pp ON pp.producto_id = p.id
JOIN producto_prep_insumos ppi ON ppi.producto_preparacion_id = pp.id
WHERE ppi.insumo_id = $1 AND p.usuario_id = $2;

-- 4. Recalcular cada producto afectado (ver sección RECALCULO)

-- 5. Log
INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json, created_at)
VALUES ($2, 'insumo', $1, 'editar',
  jsonb_build_object(
    'campo', 'precio_presentacion',
    'anterior', $old_precio,
    'nuevo', $6,
    'productos_afectados', $affected_ids
  ), NOW());
```

### DELETE /api/insumos/:id (soft delete)
```sql
-- Verificar si está en uso
SELECT COUNT(*) AS en_uso FROM producto_prep_insumos WHERE insumo_id = $1;
SELECT COUNT(*) AS en_pred FROM prep_pred_insumos WHERE insumo_id = $1;

-- Si en_uso > 0 OR en_pred > 0 → soft delete
UPDATE insumos SET estado = 'inactivo', updated_at = NOW()
WHERE id = $1 AND usuario_id = $2;

-- Si no está en uso → hard delete permitido
DELETE FROM insumos WHERE id = $1 AND usuario_id = $2;
```

---

## MATERIALES

### GET /api/materiales
```sql
SELECT id, nombre, proveedor, cantidad_presentacion, precio_presentacion,
       ROUND(precio_presentacion / cantidad_presentacion, 6) AS costo_unitario,
       detalle, estado, updated_at
FROM materiales
WHERE usuario_id = $1 AND estado = 'activo'
ORDER BY nombre ASC;
```

### POST /api/materiales
```sql
INSERT INTO materiales (usuario_id, nombre, proveedor, cantidad_presentacion, precio_presentacion, detalle, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
RETURNING id, nombre, proveedor, cantidad_presentacion, precio_presentacion,
          ROUND(precio_presentacion / cantidad_presentacion, 6) AS costo_unitario, detalle;
```

### PUT /api/materiales/:id
```sql
-- Mismo patrón que insumos: update + buscar productos afectados + recalcular + log
UPDATE materiales SET
  nombre = $3, proveedor = $4, cantidad_presentacion = $5,
  precio_presentacion = $6, detalle = $7, updated_at = NOW()
WHERE id = $1 AND usuario_id = $2
RETURNING *;

-- Productos afectados
SELECT DISTINCT p.id, p.nombre
FROM productos p
JOIN producto_materiales pm ON pm.producto_id = p.id
WHERE pm.material_id = $1 AND p.usuario_id = $2;
```

---

## PRODUCTOS (COTIZADOR)

### POST /api/productos (crear cotización)
```sql
BEGIN;

-- 1. Crear producto
INSERT INTO productos (usuario_id, nombre, margen, igv_rate, version_actual, created_at, updated_at)
VALUES ($user_id, $nombre, $margen, $igv_rate, 1, NOW(), NOW())
RETURNING id;

-- 2. Por cada preparación:
INSERT INTO producto_preparaciones (producto_id, nombre, orden, capacidad, unidad_capacidad, created_at)
VALUES ($producto_id, $prep_nombre, $prep_orden, $prep_capacidad, $prep_unidad, NOW())
RETURNING id;

-- 3. Por cada insumo de cada preparación:
INSERT INTO producto_prep_insumos (producto_preparacion_id, insumo_id, cantidad)
VALUES ($prep_id, $insumo_id, $cantidad);

-- 4. Por cada material:
INSERT INTO producto_materiales (producto_id, material_id, cantidad)
VALUES ($producto_id, $material_id, $cantidad);

-- 5. Calcular y actualizar costos (en app layer, luego UPDATE)
UPDATE productos SET
  costo_insumos = $ci, costo_empaque = $ce,
  costo_neto = $cn, precio_venta = $pv, precio_final = $pf,
  updated_at = NOW()
WHERE id = $producto_id;

-- 6. Snapshot versión 1
INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final)
VALUES ($producto_id, 1, $snapshot, 'creacion', $cn, $pf);

-- 7. Log
INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json)
VALUES ($user_id, 'producto', $producto_id, 'crear', '{"nombre": "..."}'::jsonb);

COMMIT;
```

### GET /api/productos (listar del usuario - dashboard)
```sql
SELECT id, nombre, costo_neto, costo_insumos, costo_empaque,
       margen, igv_rate, precio_venta, precio_final,
       version_actual, created_at, updated_at
FROM productos
WHERE usuario_id = $1
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;
```

### GET /api/productos/:id (detalle completo)
```sql
-- 1. Producto base
SELECT id, nombre, margen, igv_rate, costo_insumos, costo_empaque,
       costo_neto, precio_venta, precio_final, version_actual
FROM productos
WHERE id = $1 AND usuario_id = $2;

-- 2. Preparaciones con insumos
SELECT pp.id AS prep_id, pp.nombre AS prep_nombre, pp.orden, pp.capacidad, pp.unidad_capacidad,
       ppi.id AS item_id, ppi.insumo_id, ppi.cantidad AS cantidad_usada,
       i.nombre AS insumo_nombre, i.unidad_medida,
       i.precio_presentacion, i.cantidad_presentacion,
       ROUND(i.precio_presentacion / i.cantidad_presentacion, 6) AS costo_unitario,
       ROUND(ppi.cantidad * (i.precio_presentacion / i.cantidad_presentacion), 4) AS costo_linea
FROM producto_preparaciones pp
LEFT JOIN producto_prep_insumos ppi ON ppi.producto_preparacion_id = pp.id
LEFT JOIN insumos i ON i.id = ppi.insumo_id
WHERE pp.producto_id = $1
ORDER BY pp.orden, ppi.id;

-- 3. Materiales
SELECT pm.id, pm.material_id, pm.cantidad,
       m.nombre AS material_nombre, m.proveedor,
       m.precio_presentacion, m.cantidad_presentacion,
       ROUND(m.precio_presentacion / m.cantidad_presentacion, 6) AS costo_unitario,
       ROUND(pm.cantidad * (m.precio_presentacion / m.cantidad_presentacion), 4) AS costo_linea
FROM producto_materiales pm
JOIN materiales m ON m.id = pm.material_id
WHERE pm.producto_id = $1;
```

### PUT /api/productos/:id (editar cotización)
```sql
BEGIN;

-- 1. Borrar preparaciones e insumos anteriores (cascade)
DELETE FROM producto_preparaciones WHERE producto_id = $1;

-- 2. Borrar materiales anteriores
DELETE FROM producto_materiales WHERE producto_id = $1;

-- 3. Re-insertar todo (mismas queries que POST)
-- ... preparaciones, insumos, materiales ...

-- 4. Recalcular costos
-- 5. Incrementar versión
UPDATE productos SET
  nombre = $nombre, margen = $margen, igv_rate = $igv,
  costo_insumos = $ci, costo_empaque = $ce,
  costo_neto = $cn, precio_venta = $pv, precio_final = $pf,
  version_actual = version_actual + 1,
  updated_at = NOW()
WHERE id = $1 AND usuario_id = $user_id;

-- 6. Snapshot nueva versión
INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final)
VALUES ($1, $new_version, $snapshot, 'edicion', $cn, $pf);

-- 7. Log
INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json)
VALUES ($user_id, 'producto', $1, 'editar', $cambios);

COMMIT;
```

### DELETE /api/productos/:id
```sql
-- CASCADE borra preparaciones, insumos, materiales y versiones
DELETE FROM productos WHERE id = $1 AND usuario_id = $2
RETURNING id, nombre;

INSERT INTO actividad_log (usuario_id, entidad, entidad_id, accion, cambios_json)
VALUES ($2, 'producto', $1, 'eliminar', jsonb_build_object('nombre', $nombre));
```

---

## RECALCULO EN CASCADA

### Cuando cambia precio de un insumo
```javascript
// En el backend (app layer):
async function recalcularProductosPorInsumo(insumoId, usuarioId) {
  // 1. Buscar productos afectados
  const affected = await query(`
    SELECT DISTINCT p.id
    FROM productos p
    JOIN producto_preparaciones pp ON pp.producto_id = p.id
    JOIN producto_prep_insumos ppi ON ppi.producto_preparacion_id = pp.id
    WHERE ppi.insumo_id = $1 AND p.usuario_id = $2
  `, [insumoId, usuarioId]);

  // 2. Por cada producto: recalcular
  for (const { id } of affected) {
    await recalcularProducto(id, 'recalculo_precio_insumo');
  }

  return affected.length;
}

async function recalcularProducto(productoId, motivo) {
  // Fetch all data, calculate, update, create version
  const detalle = await getProductoDetalle(productoId);
  const costos = calcularCostos(detalle);
  await updateProductoCostos(productoId, costos);
  await crearVersion(productoId, detalle, motivo, costos);
}
```

### Función de cálculo (app layer)
```javascript
function calcularCostos(detalle) {
  let costo_insumos = 0;
  for (const prep of detalle.preparaciones) {
    let costo_prep = 0;
    for (const ins of prep.insumos) {
      const costo_unit = ins.precio_presentacion / ins.cantidad_presentacion;
      costo_prep += ins.cantidad_usada * costo_unit;
    }
    costo_insumos += costo_prep;
  }

  let costo_empaque = 0;
  for (const mat of detalle.materiales) {
    const costo_unit = mat.precio_presentacion / mat.cantidad_presentacion;
    costo_empaque += mat.cantidad * costo_unit;
  }

  const costo_neto = costo_insumos + costo_empaque;
  const precio_venta = costo_neto / (1 - detalle.margen);
  const precio_final = precio_venta * (1 + detalle.igv_rate);

  return {
    costo_insumos: round4(costo_insumos),
    costo_empaque: round4(costo_empaque),
    costo_neto: round4(costo_neto),
    precio_venta: round4(precio_venta),
    precio_final: round4(precio_final),
  };
}
```

---

## PREPARACIONES PREDETERMINADAS

### GET /api/preparaciones-predeterminadas
```sql
SELECT pp.id, pp.nombre, pp.updated_at,
       COALESCE(SUM(
         ppi.cantidad * (i.precio_presentacion / i.cantidad_presentacion)
       ), 0) AS costo_total,
       json_agg(json_build_object(
         'insumo_id', i.id,
         'nombre', i.nombre,
         'cantidad', ppi.cantidad,
         'unidad', i.unidad_medida,
         'costo_unitario', ROUND(i.precio_presentacion / i.cantidad_presentacion, 6)
       )) FILTER (WHERE i.id IS NOT NULL) AS insumos
FROM preparaciones_predeterminadas pp
LEFT JOIN prep_pred_insumos ppi ON ppi.preparacion_pred_id = pp.id
LEFT JOIN insumos i ON i.id = ppi.insumo_id
WHERE pp.usuario_id = $1
GROUP BY pp.id
ORDER BY pp.nombre;
```

### POST /api/preparaciones-predeterminadas
```sql
BEGIN;
INSERT INTO preparaciones_predeterminadas (usuario_id, nombre) VALUES ($1, $2) RETURNING id;
-- Por cada insumo:
INSERT INTO prep_pred_insumos (preparacion_pred_id, insumo_id, cantidad) VALUES ($pp_id, $ins_id, $cant);
COMMIT;
```

---

## HISTORIAL

### GET /api/productos/:id/versiones
```sql
SELECT version, motivo, costo_neto, precio_final, created_at
FROM producto_versiones
WHERE producto_id = $1
ORDER BY version DESC;
```

### GET /api/productos/:id/versiones/:version
```sql
SELECT version, snapshot_json, motivo, costo_neto, precio_final, created_at
FROM producto_versiones
WHERE producto_id = $1 AND version = $2;
```

### GET /api/actividad (log general del usuario)
```sql
SELECT al.id, al.entidad, al.entidad_id, al.accion, al.cambios_json, al.created_at,
       CASE
         WHEN al.entidad = 'producto' THEN (SELECT nombre FROM productos WHERE id = al.entidad_id)
         WHEN al.entidad = 'insumo' THEN (SELECT nombre FROM insumos WHERE id = al.entidad_id)
         WHEN al.entidad = 'material' THEN (SELECT nombre FROM materiales WHERE id = al.entidad_id)
       END AS entidad_nombre
FROM actividad_log al
WHERE al.usuario_id = $1
ORDER BY al.created_at DESC
LIMIT $2 OFFSET $3;
```
