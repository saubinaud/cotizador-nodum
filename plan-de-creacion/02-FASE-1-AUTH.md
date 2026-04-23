# FASE 1: Auth & Onboarding

**Dependencias:** FASE 0 completa
**Paralela con:** FASE 2 (Catálogos)
**Bloquea:** FASE 6 (no bloquea cotizador directamente, pero se necesita para el flujo completo)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-1** | Supervisor Fase 1 | Coordina auth back+front, valida flujo completo |
| **W-BE-1** | Worker Backend | Endpoints auth, admin, onboarding |
| **W-FE-1** | Worker Frontend | Páginas login, onboarding, admin |
| **QA-1** | Tester | Prueba flujos auth end-to-end |

## Sub-fases

### SF-1A: Backend Auth (W-BE-1) — PRIMERO

#### T1.1 — Middleware de autenticación JWT
**Estado:** [ ] Pendiente

```javascript
// server/src/middleware/auth.js
// - Extrae token de header Authorization: Bearer xxx
// - Verifica con JWT_SECRET
// - Agrega req.user = { id, email, rol, igv_rate }
// - 401 si no hay token o es inválido
```

#### T1.2 — Middleware de roles
**Estado:** [ ] Pendiente

```javascript
// server/src/middleware/roles.js
// requireRole('admin') → 403 si rol no coincide
```

#### T1.3 — POST /api/auth/login
**Estado:** [ ] Pendiente

- Recibe: `{ email, password }`
- Busca usuario activo por email
- Compara bcrypt
- Retorna JWT (12h) + datos del usuario
- Validaciones: email requerido, password requerido

#### T1.4 — POST /api/auth/cambiar-password
**Estado:** [ ] Pendiente

- Requiere auth
- Recibe: `{ password_actual, password_nueva }`
- Verifica password actual
- Hashea nueva y actualiza

### SF-1B: Backend Admin (W-BE-1)

#### T1.5 — POST /api/admin/usuarios (crear cliente)
**Estado:** [ ] Pendiente

- Requiere auth + rol admin
- Recibe: `{ email, password_temporal }`
- Genera onboarding_token (crypto.randomBytes)
- Crea usuario con estado='pendiente'
- Retorna: `{ id, email, link_onboarding }`

#### T1.6 — GET /api/admin/usuarios (listar clientes)
**Estado:** [ ] Pendiente

- Requiere auth + rol admin
- Paginación: `?page=1&limit=20`
- Retorna lista con datos de cada cliente

#### T1.7 — PATCH /api/admin/usuarios/:id/estado
**Estado:** [ ] Pendiente

- Requiere auth + rol admin
- Recibe: `{ estado: 'suspendido' | 'activo' }`
- Actualiza estado del cliente

### SF-1C: Backend Onboarding (W-BE-1)

#### T1.8 — GET /api/onboarding/validar
**Estado:** [ ] Pendiente

- Recibe: `?token=xxx`
- Valida que existe, estado='pendiente', no expirado
- Retorna: `{ valido: true, email }`

#### T1.9 — GET /api/onboarding/consulta-ruc/:ruc
**Estado:** [ ] Pendiente

- Llama a PeruAPI: `https://api.peruapi.com/ruc/{ruc}`
- Header: `Authorization: Bearer ${PERUAPI_KEY}`
- Retorna: razón social, tipo contribuyente
- Si falla API: retorna error pero permite continuar (campos manuales)

#### T1.10 — POST /api/onboarding/completar
**Estado:** [ ] Pendiente

- Recibe: `{ token, nombre, dni, ruc, razon_social, tipo_contribuyente, nombre_comercial, igv_rate, password }`
- Valida token vigente
- Valida DNI (8 dígitos), RUC (11 dígitos)
- Valida igv_rate es 0.1050 o 0.1800
- Hashea password
- Actualiza usuario → estado='activo'
- Retorna JWT + datos del usuario

### SF-1D: Frontend Login (W-FE-1) — PARALELO con SF-1B/1C

#### T1.11 — Página de Login
**Estado:** [ ] Pendiente

- Formulario: email + contraseña
- Botón "Iniciar sesión"
- Manejo de errores (credenciales incorrectas, cuenta suspendida)
- Redirige a /dashboard o /admin según rol
- Design: card centrada, fondo zinc-900, acento amber

### SF-1E: Frontend Onboarding (W-FE-1)

#### T1.12 — Página de Onboarding
**Estado:** [ ] Pendiente

- Lee token de URL
- Valida token al cargar
- Formulario multi-step o single-page:
  1. Datos personales (nombre, DNI)
  2. Datos del negocio (RUC → auto-fill, nombre comercial)
  3. Configuración (IGV rate)
  4. Nueva contraseña
- Auto-consulta RUC cuando tiene 11 dígitos
- Validación inline de todos los campos
- Al completar: login automático

### SF-1F: Frontend Admin (W-FE-1)

#### T1.13 — Panel Admin: Usuarios
**Estado:** [ ] Pendiente

- Tabla de clientes con estado, datos
- Modal "Crear usuario" (email + pass temporal)
- Muestra link de onboarding copiable
- Botones suspender/reactivar
- Solo accesible para rol='admin'

## Criterio de completitud

- [ ] Login funciona con email + contraseña
- [ ] Admin puede crear usuario y generar link de onboarding
- [ ] Cliente puede completar onboarding con consulta RUC
- [ ] JWT protege todas las rutas privadas
- [ ] Roles admin/cliente funcionan correctamente
- [ ] Onboarding token expira correctamente
