# Historial de Cambios

## MVP Inicial
- Backend Express + PostgreSQL con auth JWT
- Frontend React + Vite + Tailwind
- CRUD basico de insumos, materiales, productos
- Login + onboarding

## Sesion 1 — Fixes criticos
- Fix JSON.parse("undefined") crash al cargar
- Fix /auth/me endpoint (columna empresa no existia)
- Alinear backend con schema real de DB (nombres de tablas/columnas)
- Fix e.filter crash (response format d.data || [])
- Fix Tailwind v4 no escaneaba JSX (@source directive)

## Sesion 2 — Audit completo + features

### Audit backend-DB
- Todas las rutas verificadas contra schema real
- predeterminados.js: reescrito para usar tablas relacionales
- onboarding.js: columnas corregidas (empresa, onboarding_expira)
- admin.js: nueva ruta actividad, empresa→nombre_comercial
- historial.js: incluir snapshot_json en respuesta

### Features nuevas
- **Permisos por modulo**: admin asigna acceso por modulo a cada usuario
- **Eliminar usuarios**: con confirmacion
- **Editar perfil**: nombre, ruc, razon_social, igv_rate
- **Cambiar password**: POST con campos correctos
- **Actividad para usuarios**: pagina "Mi Actividad" con logs CRUD + versiones
- **Restaurar versiones**: desde historial con comparacion antes/despues
- **Vista galeria**: dashboard tipo Notion con imagenes
- **Imagen de producto**: campo URL en cotizador
- **Exportar Excel**: CSV completo con recetas detalladas
- **Proyeccion de ventas**: meta de ganancia con pesos por producto
- **Prep predeterminada**: boton "Usar predeterminada" en cotizador
- **Detalle de receta**: modal en dashboard con insumos, materiales, costos

### Mejoras UX
- Dropdown de unidad en preparaciones
- Labels encima de inputs
- Tooltips informativos (?) en cada seccion
- Pasos numerados 1-5 en cotizador
- Redondeo comercial de precios (→ .90 o .00)
- Decimales limpios (24.0000 → 24)
- Link de onboarding persistente
- Variacion numerica en comparacion de versiones

## Sesion 3 — Porciones y empaque

### Sistema de porciones
- Cada preparacion tiene rendimiento (capacidad + unidad)
- Composicion del producto: cuanto de cada prep va en el producto completo
- "Productos por tanda": cuantos productos haces con una tanda
- Costo por porcion = costo producto / unidades

### Empaque separado
- Empaque "producto entero" (caja grande)
- Empaque "por unidad" (cajita individual)
- Costo de empaque unidad se multiplica por porciones

### Doble precio
- Precio del producto entero
- Precio por porcion
- Ambos con precio sugerido comercial

### Tipo de presentacion
- "Por unidad": producto individual
- "Producto entero": divisible en porciones (ej: torta de 8)

## Deploy
- Frontend: GitHub Pages con dominio custom cotizador.nodumstudio.com
- Backend: Docker en Contabo VPS con Traefik
- Base path cambiado de /cotizador-nodum/ a / para dominio custom
