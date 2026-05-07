# Acceso VPS Contabo — Guía para IA

> Para conectarte al servidor de producción de Kudi y ejecutar comandos.

## Conexión SSH

```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27
```

**Nota:** Si falla con "Connection closed" o "Connection reset", esperar 10-30 segundos y reintentar. Contabo tiene rate limiting en SSH cuando se hacen muchas conexiones seguidas.

## Containers Docker

| Container | Servicio | Puerto |
|-----------|----------|--------|
| `cotizador-nodum-api` | Backend Express.js | 3001 |
| `cotizador-nodum-db` | PostgreSQL 16 | 5432 (interno) |
| `lycet_app` | Greenter/Lycet (facturación) | 8050 |

## Comandos frecuentes

### Base de datos
```bash
# Query directa
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-db psql -U cotizador_user -d cotizador_nodum -c \"TU_QUERY_SQL;\""

# Ejemplo: ver tablas
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-db psql -U cotizador_user -d cotizador_nodum -c \"\\dt\""

# Ejemplo: ver columnas de una tabla
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-db psql -U cotizador_user -d cotizador_nodum -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='productos' ORDER BY ordinal_position;\""
```

### Deploy backend (archivo individual)
```bash
# 1. Copiar archivo al VPS
sshpass -p 'Aubinaud919' scp -o StrictHostKeyChecking=no /Users/sebastien/Documents/Dev/Kudi/server/src/routes/ARCHIVO.js root@95.111.254.27:/tmp/kudi-deploy/ARCHIVO.js

# 2. Copiar al container + restart
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker cp /tmp/kudi-deploy/ARCHIVO.js cotizador-nodum-api:/app/src/routes/ARCHIVO.js && docker exec cotizador-nodum-api cp /app/.env /.env && docker restart cotizador-nodum-api"
```

### Deploy frontend
```bash
cd /Users/sebastien/Documents/Dev/Kudi/client && npx vite build

cd /Users/sebastien/Documents/Dev/Kudi
git stash
git checkout gh-pages
rm -rf assets index.html
cp -r client/dist/* .
git add index.html assets/
git commit -m "deploy: descripción"
git push origin gh-pages
git checkout -- logo.svg
git checkout main
git stash pop
```

### Ver logs del API
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker logs cotizador-nodum-api --tail 20 2>&1"
```

### Restart containers
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker restart cotizador-nodum-api"
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker restart lycet_app"
```

### Generar JWT para testing
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 'docker exec cotizador-nodum-api node -e "require(\"dotenv\").config({path:\"/.env\"});console.log(require(\"jsonwebtoken\").sign({id:6,email:\"k@t.com\",empresa_id:4,rol_empresa:\"owner\"},process.env.JWT_SECRET,{expiresIn:\"4h\"}))"'
```

### Ejecutar Node.js dentro del container
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-api node -e \"
  // Tu código JS aquí
  console.log('Hello from container');
\""
```

### Instalar paquetes npm en el container
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-api npm install PAQUETE --save"
```

### Backup manual de la BD
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "docker exec cotizador-nodum-db pg_dump -U cotizador_user cotizador_nodum | gzip > /opt/backups/kudi/kudi_manual.sql.gz"
```

### Restaurar backup
```bash
sshpass -p 'Aubinaud919' ssh -o StrictHostKeyChecking=no root@95.111.254.27 "gunzip -c /opt/backups/kudi/kudi_FECHA.sql.gz | docker exec -i cotizador-nodum-db psql -U cotizador_user -d cotizador_nodum"
```

## Variables de entorno del API

Ubicación: `/app/.env` dentro del container (se copia a `/.env` porque dotenv busca ahí).

```
DATABASE_URL=postgresql://cotizador_user:xxx@cotizador-nodum-db:5432/cotizador_nodum
JWT_SECRET=cotizador-nodum-jwt-2026-s3cr3t
PORT=3001
LYCET_URL=http://172.17.0.1:8050/api/v1
LYCET_TOKEN=kudi-lycet-2026-secure
R2_ENDPOINT=https://57245a76594bd8d9fa2eaae56f841903.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=76104fb1d896ce3f564248e3b653c490
R2_BUCKET=kudi
R2_PUBLIC_URL=https://pub-05912406082e40249f42d954af75b37e.r2.dev
FACTURACION_CERT_KEY=798a738db65347ffbb15456477806958c90e672c051356a1d59b5b2e4b1df232
```

**IMPORTANTE:** Siempre ejecutar `docker exec cotizador-nodum-api cp /app/.env /.env` antes de restart, porque dotenv busca en `/.env` no en `/app/.env`.

## Estructura de archivos en el container

```
/app/
├── src/
│   ├── routes/          ← todos los endpoints
│   ├── middleware/       ← auth.js
│   ├── models/          ← migrate.js, db.js
│   ├── services/        ← calculador.js
│   └── utils/           ← facturacion.js, sunat-codes.js, dateRange.js, audit.js, unidades.js
├── .env                 ← config (copiar a /.env antes de restart)
├── package.json
└── node_modules/
```

## Cron jobs

```
0 5 * * * /opt/kudi-backup.sh   # Backup BD a las 12AM Lima (5AM UTC)
```

## Tips

- Si SSH falla repetidamente, esperar 60 segundos (rate limiting de Contabo)
- Para queries SQL largas con comillas, usar `$$ $$` en vez de escapar comillas
- El token JWT expira según `expiresIn` — usar `4h` para sesiones de desarrollo
- Las imágenes se suben a R2, no al VPS (no sobrecargar disco)
- Los certificados de facturación están en `/opt/lycet/data/`
