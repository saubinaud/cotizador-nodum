# FASE 0: Fundación

**Dependencias:** Ninguna (es la base de todo)
**Bloquea:** FASE 1, 2, 3, 4, 5, 6
**Ejecución:** SECUENCIAL (todo debe existir antes de las demás fases)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-0** | Supervisor Fase 0 | Coordina y valida que todo compile |
| **W-BE-0** | Worker Backend | Setup Express, DB schema, estructura |
| **W-FE-0** | Worker Frontend | Setup Vite, React, Tailwind, Router, Design System |

## Tareas

### T0.1 — Estructura de carpetas del proyecto
**Agente:** W-BE-0
**Estado:** [ ] Pendiente

```
cotizador-nodum/
├── client/                  # Frontend (Vite + React)
│   ├── src/
│   │   ├── components/      # Componentes reutilizables
│   │   ├── pages/           # Páginas (rutas)
│   │   ├── hooks/           # Custom hooks
│   │   ├── services/        # API calls
│   │   ├── context/         # Auth context, etc.
│   │   ├── utils/           # Helpers
│   │   ├── styles/          # Tokens, globals
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── server/                  # Backend (Express)
│   ├── src/
│   │   ├── routes/          # Rutas Express
│   │   ├── controllers/     # Lógica de negocio
│   │   ├── middleware/      # Auth, validation
│   │   ├── models/          # Queries SQL
│   │   ├── services/        # Cálculos, PeruAPI
│   │   ├── utils/           # Helpers
│   │   └── app.js
│   ├── package.json
│   └── .env.example
├── sql/                     # Scripts SQL
│   └── schema.sql
├── plan-de-creacion/        # Este plan
├── .gitignore
└── README.md
```

### T0.2 — Setup Backend (Express + PostgreSQL)
**Agente:** W-BE-0
**Estado:** [ ] Pendiente

- Inicializar `server/package.json`
- Dependencias: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `helmet`
- Crear `server/src/app.js` con Express base
- Crear `server/.env.example` con variables necesarias
- Crear pool de PostgreSQL (`server/src/models/db.js`)
- Middleware: cors, helmet, json parser, error handler

### T0.3 — Schema SQL
**Agente:** W-BE-0
**Estado:** [ ] Pendiente

- Crear `sql/schema.sql` con todas las tablas (ver `08-ESQUEMA-BD.md`)
- Incluir índices
- Incluir seed de usuario admin

### T0.4 — Setup Frontend (Vite + React + Tailwind v4)
**Agente:** W-FE-0
**Estado:** [ ] Pendiente

- `npm create vite@latest client -- --template react`
- Instalar: `tailwindcss`, `@tailwindcss/vite`, `react-router-dom`
- Configurar `vite.config.js` con base path para GitHub Pages
- Configurar Tailwind v4 (sin CSS pre-compilado, con @tailwindcss/vite)

### T0.5 — Design System (reciclado de Space AMAS)
**Agente:** W-FE-0
**Estado:** [ ] Pendiente

Tokens y componentes base:
- Fondo: `bg-zinc-900`
- Superficie: `bg-zinc-800`
- Borde: `border-zinc-700`
- Texto primario: `text-white`
- Texto secundario: `text-zinc-400`
- Acento: `text-amber-500` / `bg-amber-500`
- Input: `bg-zinc-800 border-zinc-600 focus:border-amber-500`
- Botón primario: `bg-amber-500 hover:bg-amber-600 text-black`
- Botón secundario: `bg-zinc-700 hover:bg-zinc-600 text-white`
- Card: `bg-zinc-800 border border-zinc-700 rounded-xl`

Componentes base a crear:
- `Button.jsx`
- `Input.jsx`
- `Select.jsx`
- `Card.jsx`
- `Table.jsx`
- `Modal.jsx`
- `Toast.jsx`
- `Layout.jsx` (sidebar + header)
- `ProtectedRoute.jsx`

### T0.6 — React Router base
**Agente:** W-FE-0
**Estado:** [ ] Pendiente

```jsx
// Todas las rutas definidas en App.jsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/onboarding" element={<OnboardingPage />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<Layout />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/cotizador" element={<CotizadorPage />} />
      <Route path="/cotizador/:id" element={<CotizadorPage />} />
      <Route path="/insumos" element={<InsumosPage />} />
      <Route path="/materiales" element={<MaterialesPage />} />
      <Route path="/preparaciones-predeterminadas" element={<PrepPredPage />} />
      <Route path="/empaques-predeterminados" element={<EmpaquePredPage />} />
      <Route path="/perfil" element={<PerfilPage />} />
    </Route>
    <Route element={<AdminRoute />}>
      <Route element={<Layout />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/usuarios" element={<AdminUsuariosPage />} />
        <Route path="/admin/actividad" element={<AdminActividadPage />} />
      </Route>
    </Route>
  </Route>
</Routes>
```

### T0.7 — Auth Context + API Service base
**Agente:** W-FE-0
**Estado:** [ ] Pendiente

- `AuthContext.jsx`: almacena JWT, user info, login/logout
- `api.js`: axios/fetch wrapper con JWT header automático
- `ProtectedRoute.jsx`: redirige a /login si no hay token

### T0.8 — .gitignore + .env setup
**Agente:** W-BE-0
**Estado:** [ ] Pendiente

```gitignore
node_modules/
.env
*.log
dist/
.DS_Store
```

`.env` necesario:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/cotizador_nodum
JWT_SECRET=xxx
PERUAPI_KEY=xxx
PORT=3001
NODE_ENV=development
```

## Criterio de completitud

- [ ] `npm run dev` en client/ abre la app con layout base
- [ ] `npm run dev` en server/ levanta Express en puerto 3001
- [ ] Schema SQL ejecuta sin errores
- [ ] Rutas del router cargan páginas placeholder
- [ ] Design tokens aplicados correctamente
