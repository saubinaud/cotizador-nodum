# FASE 6: Deploy, QA & Polish

**Dependencias:** TODAS las fases anteriores
**Paralela con:** Nada (fase final)

## Agentes

| Agente | Rol | Tareas |
|--------|-----|--------|
| **SUP-6** | Supervisor Fase 6 | Coordina deploy y QA final |
| **W-DEVOPS** | Worker DevOps | Docker, CI/CD, deploy |
| **W-QA** | Worker QA | Tests end-to-end, revisión general |

## Sub-fases

### SF-6A: Deploy Frontend (GitHub Pages)

#### T6.1 — Configurar build para GitHub Pages
**Estado:** [ ] Pendiente

- `vite.config.js`: base = '/cotizador-nodum/'
- Build: `npm run build` → genera `dist/`
- GitHub Actions workflow para deploy automático en push a main

#### T6.2 — GitHub Actions workflow
**Estado:** [ ] Pendiente

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
    paths: ['client/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd client && npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./client/dist
```

#### T6.3 — Configurar SPA fallback para React Router
**Estado:** [ ] Pendiente

- Crear `client/public/404.html` con redirect script para GitHub Pages SPA
- O usar HashRouter en vez de BrowserRouter

### SF-6B: Deploy Backend (Docker en Contabo)

#### T6.4 — Dockerfile del backend
**Estado:** [ ] Pendiente

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/src ./src
EXPOSE 3001
CMD ["node", "src/app.js"]
```

#### T6.5 — docker-compose.yml
**Estado:** [ ] Pendiente

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    environment:
      POSTGRES_DB: cotizador_nodum
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
    restart: unless-stopped

volumes:
  pgdata:
```

#### T6.6 — Configurar en Contabo / EasyPanel
**Estado:** [ ] Pendiente

- Subir docker-compose al VPS
- Configurar red (misma red que otros servicios si aplica)
- Configurar dominio/subdomain si se tiene
- HTTPS con Let's Encrypt / reverse proxy

#### T6.7 — Variables de entorno en producción
**Estado:** [ ] Pendiente

```env
DATABASE_URL=postgresql://user:pass@db:5432/cotizador_nodum
JWT_SECRET=<generar secreto fuerte>
PERUAPI_KEY=274e838ceff653cd334c121a58ab58ac
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://saubinaud.github.io
```

### SF-6C: QA Final

#### T6.8 — Test de flujo completo
**Estado:** [ ] Pendiente

1. Admin crea usuario → link de onboarding
2. Cliente completa onboarding (con consulta RUC)
3. Cliente logea
4. Agrega insumos al catálogo
5. Agrega materiales al catálogo
6. Crea producto en cotizador
7. Verifica cálculos correctos
8. Edita producto → verifica nueva versión
9. Cambia precio de insumo → verifica recálculo cascada
10. Ve historial de versiones
11. Ve log de actividad

#### T6.9 — Verificar cálculos con datos del Excel
**Estado:** [ ] Pendiente

- Cargar los mismos insumos del Excel
- Crear la misma receta (Empanada con los datos de ejemplo)
- Verificar que los costos coincidan

#### T6.10 — Revisión de seguridad
**Estado:** [ ] Pendiente

- [ ] JWT se valida en todas las rutas protegidas
- [ ] Cada usuario solo ve/edita SUS datos (verificar usuario_id en todas las queries)
- [ ] Input validation en todos los endpoints
- [ ] No SQL injection (usar parameterized queries)
- [ ] Contraseñas hasheadas con bcrypt
- [ ] CORS configurado solo para el origen del frontend
- [ ] .env no se commitea
- [ ] Rate limiting en login
- [ ] Onboarding token expira

## Criterio de completitud

- [ ] Frontend accesible en https://saubinaud.github.io/cotizador-nodum/
- [ ] Backend corriendo en Contabo con Docker
- [ ] PostgreSQL con schema aplicado
- [ ] Todos los flujos funcionan end-to-end
- [ ] Cálculos verificados contra el Excel
- [ ] Sin vulnerabilidades de seguridad evidentes
- [ ] Admin puede gestionar usuarios
- [ ] Clientes pueden cotizar productos
