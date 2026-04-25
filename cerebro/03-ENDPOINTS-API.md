# Endpoints API

**Base URL:** `https://cotizador-api.s6hx3x.easypanel.host/api`

Todos los endpoints retornan `{ success: true, data: {...} }` o `{ success: false, error: "..." }`.

## Auth (`/api/auth`)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/login` | No | Login con email + password. Retorna token + user |
| GET | `/me` | Si | Datos del usuario actual (incluye permisos) |
| POST | `/cambiar-password` | Si | Cambiar password (password_actual + password_nueva) |
| PUT | `/perfil` | Si | Editar perfil (nombre, ruc, razon_social, igv_rate) |

## Admin (`/api/admin`) — requiere rol admin

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/usuarios` | Lista todos los usuarios (incluye onboarding_token, permisos) |
| POST | `/usuarios` | Crear usuario (email, nombre, rol, empresa, permisos) |
| DELETE | `/usuarios/:id` | Eliminar usuario (no puedes eliminarte a ti mismo) |
| PATCH | `/usuarios/:id/estado` | Cambiar estado (activo/inactivo/pendiente) |
| PATCH | `/usuarios/:id/permisos` | Actualizar permisos (array de modulos) |
| GET | `/actividad` | Log de actividad global (page, limit) |

## Insumos (`/api/insumos`) — requiere auth

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/` | Lista insumos del usuario |
| GET | `/:id` | Detalle de un insumo |
| POST | `/` | Crear insumo (nombre, unidad_medida, cantidad_presentacion, precio_presentacion) |
| PUT | `/:id` | Editar insumo. Si cambia precio, recalcula productos afectados |
| DELETE | `/:id` | Eliminar (falla si esta en uso en productos) |

## Materiales (`/api/materiales`) — requiere auth

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/` | Lista materiales del usuario |
| GET | `/:id` | Detalle |
| POST | `/` | Crear (nombre, proveedor, detalle, unidad_medida, cantidad_presentacion, precio_presentacion) |
| PUT | `/:id` | Editar. Recalcula productos si cambia precio |
| DELETE | `/:id` | Eliminar (falla si esta en uso) |

## Productos (`/api/productos`) — requiere auth

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/` | Lista productos con costos, imagen, tipo_presentacion |
| GET | `/:id` | Detalle completo: preparaciones con insumos + materiales |
| POST | `/` | Crear producto con preparaciones, materiales, porciones |
| PUT | `/:id` | Editar producto completo |
| DELETE | `/:id` | Eliminar con todas sus dependencias |
| POST | `/:id/duplicar` | Duplicar producto |
| POST | `/:id/restaurar/:version` | Restaurar a una version anterior |

### Payload de crear/editar producto:
```json
{
  "nombre": "Cheesecake",
  "margen": 50,
  "igv_rate": 0.18,
  "imagen_url": "https://...",
  "tipo_presentacion": "entero",
  "unidades_por_producto": 8,
  "preparaciones": [
    {
      "nombre": "Masa galleta",
      "capacidad": 500,
      "unidad": "g",
      "cantidad_por_unidad": 400,
      "insumos": [
        { "insumo_id": 1, "cantidad": 200 }
      ]
    }
  ],
  "materiales": [
    { "material_id": 1, "cantidad": 1, "empaque_tipo": "entero" },
    { "material_id": 2, "cantidad": 1, "empaque_tipo": "unidad" }
  ]
}
```

## Predeterminados (`/api/predeterminados`)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/preparaciones` | Lista prep predeterminadas con sus insumos |
| POST | `/preparaciones` | Crear (nombre + insumos) |
| PUT | `/preparaciones/:id` | Editar |
| DELETE | `/preparaciones/:id` | Eliminar |
| GET | `/empaques` | Lista empaques predeterminados con materiales |
| POST | `/empaques` | Crear |
| PUT | `/empaques/:id` | Editar |
| DELETE | `/empaques/:id` | Eliminar |

## Historial (`/api/historial`)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/productos/:id/versiones` | Versiones de un producto (incluye snapshot_json) |
| GET | `/productos/:id/versiones/:v` | Detalle de una version |
| GET | `/actividad` | Actividad del usuario (CRUD logs + versiones de productos) |

## Onboarding (`/api/onboarding`)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/validar?token=xxx` | Validar token de onboarding |
| GET | `/consulta-ruc/:ruc` | Consultar RUC en PeruAPI |
| POST | `/completar` | Completar registro (token, password, ruc, etc) |
