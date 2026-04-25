# Deploy

## Frontend (GitHub Pages)

El frontend se sirve desde la rama `gh-pages` del repo.
Dominio custom: `cotizador.nodumstudio.com`

### Proceso de deploy:

```bash
# 1. Build
cd client
npm run build

# 2. Copiar dist a gh-pages
cd ..
git checkout gh-pages
cp client/dist/index.html .
cp -r client/dist/assets .
git add index.html assets/
git commit -m "deploy: descripcion del cambio"
git push origin gh-pages

# 3. Volver a main
git checkout main
```

### Archivos en gh-pages:
- `index.html` — app entry point
- `assets/` — JS y CSS compilados
- `favicon.svg`, `icons.svg`
- `CNAME` — `cotizador.nodumstudio.com`
- `.nojekyll` — evita procesamiento Jekyll
- `.gitignore`

### Importante:
- `vite.config.js` tiene `base: '/'` (para dominio custom)
- Si se cambia a GitHub Pages sin dominio custom, poner `base: '/cotizador-nodum/'`
- Tailwind v4 necesita `@source "."` en `index.css` para escanear JSX

## Backend (Docker en Contabo VPS)

### Container: `cotizador-nodum-api`
- Puerto: 3003 (externo) → 3001 (interno)
- Traefik: `cotizador-api.s6hx3x.easypanel.host`
- Sin volume mounts (archivos dentro del container)

### Container: `cotizador-nodum-db`  
- PostgreSQL 16 Alpine
- Puerto: 5437 (externo) → 5432 (interno)
- User: `cotizador_user`
- Database: `cotizador_nodum`

### Subir archivos al backend:

```bash
# Subir archivos al VPS
sshpass -p 'PASSWORD' scp -o StrictHostKeyChecking=no \
  server/src/routes/ARCHIVO.js \
  root@95.111.254.27:/tmp/

# Copiar al container y reiniciar
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@95.111.254.27 \
  "docker cp /tmp/ARCHIVO.js cotizador-nodum-api:/app/src/routes/ && \
   docker restart cotizador-nodum-api"
```

### Verificar:
```bash
# Ver logs
docker logs cotizador-nodum-api --tail 10

# Debe mostrar:
# Cotizador Nodum API running on port 3001
# [migrate] OK
```

### Migraciones:
Las migraciones se ejecutan automaticamente al arrancar (`migrate.js`). Usan `IF NOT EXISTS` para ser seguras de re-ejecutar.

## Variables de entorno (.env)

```env
DATABASE_URL=postgresql://cotizador_user:PASSWORD@cotizador-nodum-db:5432/cotizador_nodum
JWT_SECRET=tu_secreto_jwt
CORS_ORIGIN=https://cotizador.nodumstudio.com
PORT=3001
PERUAPI_KEY=tu_key_peruapi
```

## Checklist de deploy

- [ ] Build sin errores (`npm run build`)
- [ ] Commit a main con mensaje descriptivo
- [ ] Deploy a gh-pages (copiar dist)
- [ ] Push gh-pages
- [ ] Subir archivos backend al VPS (si hay cambios server)
- [ ] Reiniciar container
- [ ] Verificar logs limpios
- [ ] Test en `cotizador.nodumstudio.com`
