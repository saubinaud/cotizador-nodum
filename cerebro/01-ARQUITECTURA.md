# Arquitectura del Proyecto

## Stack

| Capa | Tecnologia | Detalle |
|------|-----------|---------|
| **Frontend** | React 19 + Vite 8 | SPA con HashRouter |
| **CSS** | Tailwind CSS v4 | `@tailwindcss/vite` plugin, `@source "."` en index.css |
| **Icons** | Lucide React | Iconos SVG |
| **Backend** | Express.js (Node 20) | API REST con JWT |
| **Base de datos** | PostgreSQL 16 Alpine | Docker container |
| **Deploy frontend** | GitHub Pages | Branch `gh-pages`, dominio custom `cotizador.nodumstudio.com` |
| **Deploy backend** | Docker en Contabo VPS | Puerto 3003 -> 3001 interno, Traefik reverse proxy |

## Estructura de archivos

```
cotizador-nodum/
├── client/
│   ├── src/
│   │   ├── components/         # Componentes reutilizables
│   │   │   ├── Layout.jsx      # Sidebar + navegacion
│   │   │   ├── SearchableSelect.jsx  # Dropdown con busqueda
│   │   │   ├── ConfirmDialog.jsx     # Modal de confirmacion
│   │   │   ├── ProtectedRoute.jsx    # Guard de auth
│   │   │   └── AdminRoute.jsx        # Guard de admin
│   │   ├── context/
│   │   │   ├── AuthContext.jsx # Login, logout, token, user state
│   │   │   └── ToastContext.jsx # Notificaciones
│   │   ├── hooks/
│   │   │   ├── useApi.js       # HTTP client (get, post, put, patch, del)
│   │   │   └── useCalculadorCostos.js  # Logica de costeo
│   │   ├── pages/              # Todas las paginas
│   │   ├── styles/
│   │   │   └── tokens.js       # Design tokens (cx.btnPrimary, cx.card, etc)
│   │   ├── utils/
│   │   │   └── format.js       # formatCurrency, formatPercent, formatDate, precioComercial
│   │   ├── config/
│   │   │   └── api.js          # API_BASE URL
│   │   ├── App.jsx             # Rutas
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Tailwind import
│   ├── vite.config.js          # base: '/' para dominio custom
│   └── package.json
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, /me, cambiar password, perfil
│   │   │   ├── admin.js        # CRUD usuarios, permisos, actividad
│   │   │   ├── insumos.js      # CRUD insumos
│   │   │   ├── materiales.js   # CRUD materiales
│   │   │   ├── productos.js    # CRUD productos + duplicar + restaurar
│   │   │   ├── predeterminados.js  # Prep y empaques predeterminados
│   │   │   ├── historial.js    # Versiones + actividad del usuario
│   │   │   └── onboarding.js   # Registro de nuevos usuarios
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT verification
│   │   │   └── roles.js        # requireRole('admin')
│   │   ├── models/
│   │   │   ├── db.js           # Pool de PostgreSQL
│   │   │   └── migrate.js      # Migraciones auto al arrancar
│   │   ├── services/
│   │   │   └── calculador.js   # Calculo de costos server-side
│   │   └── app.js              # Express app + server
│   └── package.json
├── cerebro/                    # Documentacion del proyecto
├── .env                        # Variables de entorno (NO en git)
└── .gitignore
```

## Autenticacion

- Login con email + password
- JWT con expiracion de 12 horas
- Token almacenado en `localStorage` (`nodum_token`)
- User data en `localStorage` (`nodum_user`)
- `/auth/me` se ejecuta al cargar para validar token

## Permisos

- Roles: `admin` y `cliente`
- Modulos: `dashboard`, `cotizador`, `insumos`, `materiales`, `preparaciones`, `empaques`, `proyeccion`
- Admin ve todo siempre
- Cliente ve solo los modulos asignados en `permisos` (JSONB)
- Sidebar se filtra segun permisos del usuario
