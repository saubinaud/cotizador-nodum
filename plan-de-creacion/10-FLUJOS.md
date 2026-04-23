# Flujos de la Aplicación - Cotizador Nodum

## FLUJO 1: Admin crea usuario

```
Admin (logueado)
│
├─ Llena: email del cliente
├─ Llena: contraseña temporal
│
└─ POST /api/admin/usuarios
   │
   ├─ Valida email único
   ├─ Hashea contraseña temporal
   ├─ Genera onboarding_token (hex 32 bytes)
   ├─ Guarda usuario con estado='pendiente'
   └─ Retorna { id, email, onboarding_token }
   │
   └─ Admin copia link: /onboarding?token=abc123
      y lo envía al cliente (WhatsApp, email, etc.)
```

## FLUJO 2: Cliente completa onboarding

```
Cliente abre link /onboarding?token=abc123
│
├─ GET /api/onboarding/validar?token=abc123
│  ├─ Token válido y no expirado → muestra formulario
│  └─ Token inválido/expirado → pantalla de error
│
├─ Cliente llena formulario:
│  ├─ Nombre completo
│  ├─ DNI (8 dígitos)
│  ├─ RUC (11 dígitos)
│  │   │
│  │   └─ Al escribir 11 dígitos → GET /api/onboarding/consulta-ruc/:ruc
│  │      │
│  │      ├─ PeruAPI responde → auto-llena:
│  │      │  ├─ Razón social
│  │      │  └─ Tipo contribuyente (10=persona natural, 20=empresa)
│  │      │
│  │      └─ PeruAPI falla → campos manuales
│  │
│  ├─ Nombre comercial ("Pastelería Nodum")
│  ├─ Tasa IGV: radio button
│  │   ○ 10.5% (restaurante MYPE)
│  │   ○ 18% (general)
│  ├─ Nueva contraseña
│  └─ Confirmar contraseña
│
└─ POST /api/onboarding/completar
   ├─ Valida todos los campos
   ├─ Valida token vigente
   ├─ Hashea nueva contraseña
   ├─ Actualiza usuario: datos + estado='activo' + token=NULL
   └─ Retorna JWT → redirige a /dashboard
```

## FLUJO 3: Login

```
Cliente va a /login
│
├─ Llena: email + contraseña
│
└─ POST /api/auth/login
   ├─ Busca usuario por email con estado='activo'
   ├─ bcrypt.compare(password, hash)
   ├─ Si ok → JWT { id, email, rol, igv_rate }
   └─ Si falla → error 401
   │
   ├─ rol='admin' → redirige a /admin
   └─ rol='cliente' → redirige a /dashboard
```

## FLUJO 4: Gestión de catálogo de insumos

```
Cliente en /insumos
│
├─ VE: tabla con todos sus insumos
│  │ Nombre | Presentación | Unidad | Precio | Costo Unit | Acciones
│  │ Leche  | 345          | ml     | 3.80   | 0.011014   | [Editar][Eliminar]
│  │ Harina | 1000         | g      | 4.50   | 0.004500   | [Editar][Eliminar]
│
├─ [+ Nuevo insumo] → modal/fila editable
│  ├─ Nombre: [__________]
│  ├─ Cantidad presentación: [_____]
│  ├─ Unidad: [dropdown: g, ml, uni, oz, kg, l]
│  ├─ Precio presentación: S/ [______]
│  ├─ Costo unitario: S/ 0.XXXXX (calculado en vivo)
│  └─ [Guardar]
│     └─ POST /api/insumos
│
├─ [Editar] → misma fila se vuelve editable
│  ├─ Cambia valores
│  └─ [Guardar]
│     └─ PUT /api/insumos/:id
│        ├─ Si cambió precio → recalcula productos afectados
│        └─ Muestra: "Se recalcularon N productos"
│
└─ [Eliminar]
   ├─ Si está en uso → "Este insumo se usa en N productos. ¿Desactivar?"
   │  └─ Soft delete (estado='inactivo')
   └─ Si no está en uso → "¿Eliminar definitivamente?"
      └─ Hard delete
```

## FLUJO 5: Gestión de catálogo de materiales

```
(Mismo flujo que insumos pero con campos adicionales: proveedor, detalle)
Cliente en /materiales
│
├─ VE: tabla con todos sus materiales
│  │ Nombre      | Proveedor | Presentación | Precio  | Costo Unit | Detalle
│  │ Bolsa peq   | Lima      | 250 uni      | 277.00  | 1.108      | Para box
│
├─ CRUD idéntico al de insumos
└─ Misma lógica de cascada al editar precios
```

## FLUJO 6: Cotizador (crear producto)

```
Cliente en /cotizador
│
├─ 1. NOMBRE DEL PRODUCTO: [Empanada_______]
│
├─ 2. ARMA TU RECETA:
│  │
│  ├─ [+ Agregar preparación]
│  │
│  ├─ PREPARACIÓN 1: [Masa____________]
│  │  ├─ Capacidad: [500] [g]
│  │  ├─ Insumos:
│  │  │  │ [Dropdown insumos] | Cantidad | Unidad | Costo
│  │  │  │ Harina             | 500      | g      | 2.25
│  │  │  │ Mantequilla        | 100      | g      | 5.44
│  │  │  │ [+ Agregar insumo]
│  │  │  └─ Subtotal preparación: S/ 7.69
│  │  │
│  │  └─ O: [Usar preparación predeterminada ▼]
│  │
│  ├─ PREPARACIÓN 2: [Relleno_________]
│  │  ├─ (mismo formato, sin límite de insumos)
│  │  └─ Subtotal: S/ X.XX
│  │
│  ├─ PREPARACIÓN N: ...
│  │
│  └─ COSTO TOTAL INSUMOS: S/ XX.XX (suma de todas las preparaciones)
│
├─ 3. ARMA TU PACKAGING:
│  │  │ [Dropdown materiales] | Cantidad | Costo
│  │  │ Bolsa pequeña         | 1        | 1.108
│  │  │ Sticker               | 1        | 0.067
│  │  │ [+ Agregar material]
│  │  │
│  │  └─ O: [Usar empaque predeterminado ▼]
│  │
│  └─ COSTO TOTAL EMPAQUE: S/ X.XX
│
├─ 4. COTIZACIÓN:
│  │
│  │  Costo insumos:    S/ XX.XX
│  │  Costo empaque:    S/ XX.XX
│  │  ──────────────────────────
│  │  COSTO NETO:       S/ XX.XX
│  │
│  │  Margen (%):       [50___] ← slider o input editable
│  │  Precio venta:     S/ XX.XX  (= costo_neto / (1 - margen))
│  │
│  │  IGV:              10.5% ← viene del perfil del usuario
│  │  ──────────────────────────
│  │  PRECIO FINAL:     S/ XX.XX  (= precio_venta * (1 + igv))
│
├─ [VACIAR] → limpia todo el formulario
└─ [GUARDAR]
   └─ POST /api/productos
      ├─ Crea producto + preparaciones + insumos + materiales
      ├─ Calcula costos
      ├─ Crea versión 1
      ├─ Log
      └─ Redirige a /dashboard con nuevo producto
```

## FLUJO 7: Editar producto existente

```
Cliente en /dashboard
│
├─ Click en producto "Empanada"
│
└─ GET /api/productos/:id → carga todo el detalle
   │
   └─ /cotizador/:id (mismo formulario, pre-llenado)
      │
      ├─ Cliente modifica lo que quiera
      │  (agregar/quitar insumos, cambiar cantidades, etc.)
      │
      └─ [GUARDAR]
         └─ PUT /api/productos/:id
            ├─ Borra preparaciones/materiales anteriores
            ├─ Re-inserta todo
            ├─ Recalcula costos
            ├─ version_actual++
            ├─ Crea snapshot de la nueva versión
            └─ Log con motivo='edicion'
```

## FLUJO 8: Cambio de precio de insumo (cascada)

```
Cliente edita insumo "Harina": precio 4.50 → 5.00
│
├─ PUT /api/insumos/:id
│  ├─ Actualiza el insumo
│  ├─ Busca productos que usan "Harina"
│  │   → Empanada, Pan de molde, Torta de chocolate
│  │
│  ├─ Por cada producto afectado:
│  │  ├─ Recalcula todos los costos
│  │  ├─ Crea nueva versión (motivo: 'recalculo_precio_insumo')
│  │  └─ Log
│  │
│  └─ Respuesta: { insumo_actualizado, productos_recalculados: 3 }
│
└─ UI muestra toast: "Harina actualizada. 3 productos recalculados."
```

## FLUJO 9: Dashboard

```
Cliente en /dashboard
│
├─ VE: grid/tabla de todos sus productos cotizados
│  │ Nombre     | Costo Neto | Margen | Precio Final | Última edición
│  │ Empanada   | S/ 5.20    | 50%    | S/ 12.26     | hace 2 días
│  │ Brownie    | S/ 3.10    | 60%    | S/ 9.13      | hace 1 semana
│
├─ [+ Nuevo producto] → /cotizador
├─ [Editar] → /cotizador/:id
├─ [Duplicar] → crea copia del producto
├─ [Eliminar] → confirmación → DELETE
└─ [Ver historial] → modal con versiones
```

## FLUJO 10: Ver historial de un producto

```
Cliente en /dashboard → click [Historial] en "Empanada"
│
├─ GET /api/productos/:id/versiones
│
└─ Modal/página:
   │ Versión | Fecha       | Motivo              | Costo Neto | Precio Final
   │ 3       | 22/04/2026  | Precio insumo       | S/ 5.80    | S/ 13.67 ▲
   │ 2       | 15/04/2026  | Edición receta      | S/ 5.20    | S/ 12.26
   │ 1       | 10/04/2026  | Creación            | S/ 4.90    | S/ 11.55
   │
   └─ Click en versión → ve el snapshot completo (qué insumos, cantidades, costos)
```

## FLUJO 11: Panel Admin

```
Admin en /admin
│
├─ VE: lista de todos los clientes
│  │ Email           | Nombre  | Negocio         | RUC         | Estado    | IGV
│  │ juan@mail.com   | Juan P  | Dulces Juan     | 20xxxxxxx   | activo    | 18%
│  │ maria@mail.com  | —       | —               | —           | pendiente | —
│
├─ [+ Crear usuario]
│  ├─ Email: [__________]
│  ├─ Contraseña temporal: [__________]
│  └─ [Crear] → genera link de onboarding → lo muestra/copia
│
├─ [Suspender] → cambia estado
└─ [Reactivar] → cambia estado
```

## MAPA DE RUTAS (Frontend)

```
/login                          → LoginPage
/onboarding?token=xxx           → OnboardingPage
/dashboard                      → DashboardPage (lista productos)
/cotizador                      → CotizadorPage (crear)
/cotizador/:id                  → CotizadorPage (editar)
/insumos                        → InsumosPage (tabla CRUD)
/materiales                     → MaterialesPage (tabla CRUD)
/preparaciones-predeterminadas  → PrepPredPage
/empaques-predeterminados       → EmpaquePredPage
/perfil                         → PerfilPage
/admin                          → AdminPage (solo rol admin)
/admin/usuarios                 → AdminUsuariosPage
/admin/actividad                → AdminActividadPage
```
