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

## Sesion 4 — Arquitectura, internacionalizacion, UX premium

### Arquitectura normalizada de costos
- `unidad_base` + `costo_base` en insumos (auto-calculado)
- `cantidad_base` + `costo_linea` pre-calculados en producto_prep_insumos
- `server/src/utils/unidades.js` = unica fuente de conversiones (FACTORES, aBase, deBase)
- Frontend calcula preview, backend guarda valores del frontend

### Tabla paises con FK
- `paises` (code, nombre, moneda, simbolo, igv_default) — 18 paises LATAM
- `usuarios.pais_code` FK → paises.code
- Eliminadas columnas obsoletas `pais` y `moneda` de usuarios
- Moneda/simbolo viene del JOIN, no hardcoded

### Internacionalizacion
- Tipo negocio: formal (paga IGV) / informal (IGV=0)
- IGV en cascada: cambiar IGV en perfil recalcula todos los productos
- Simbolo de moneda automatico segun pais (S/, $, R$, etc.)

### Logo Cloudinary
- Upload base64 → Cloudinary REST API (sin SDK)
- Logo personalizado en sidebar y header
- Guardado en `usuarios.logo_url`

### Variantes de insumo
- Mismo nombre, diferente presentacion (Mantequilla 180g / 1kg)
- ★ marca la variante mas barata en el dropdown
- Cambio de unidad (kg→g) guardado como `uso_unidad` en DB

### Rediseno UX premium (Apple + Airbnb + Seiko Presage)
- Tema light: fondo #f7f7f7 (Apple), cards blancas
- 3 temas switchables: Coral (Manhattan), Lavanda (Blue Moon), Menta (Mockingbird)
- CustomSelect reemplaza TODOS los select nativos del OS
- Cotizador: acordeon unico para preps, sidebar Airbnb booking-card
- Tokens compactos: text-[13px], py-2, minimal
- Colores Seiko Presage: mas profundos y elegantes

## Sesion 5 — P&L, Transacciones, WAC, Rebrand

### Rebrand NODUM → Kudi
- Nombre cambiado en toda la UI, exports, titulos
- Dominio: kudi.nodumstudio.com
- Logo: K geometrica en emerald con punto de acento
- Tema default: Menta (#059669) en vez de Coral

### Sistema P&L completo
- 6 tablas: periodos, categorias_gasto, ventas, gastos, compras+compra_items, pl_snapshots
- Sidebar con secciones colapsables: Cotizador + P&L
- Seed de 9 categorias de gasto predeterminadas al primer periodo
- Ventas: CRUD con 4 tipos de descuento (fijo/unitario/porcentual/ninguno)
- Gastos: agrupados por categoria, copiar recurrentes del mes anterior
- Compras: con items vinculados a insumos/materiales, variacion vs catalogo
- Dashboard P&L: estado de resultados contable (KPIs, food cost %, punto equilibrio)

### Transacciones unificadas
- Tabla `transacciones` centraliza ventas/gastos/compras
- Timeline estilo app de banco (agrupado por fecha, color por tipo)
- Quick-add modal con 3 tabs (Venta/Compra/Gasto)
- Boton + flotante en mobile
- Balance summary: ingresos/compras/gastos/balance
- Dual-write: legacy tables + transacciones para backward compat

### WAC (Weighted Average Cost)
- Tabla `insumo_precios` registra cada compra por insumo
- Al registrar compra: auto-calcula WAC y actualiza `insumos.costo_base`
- Sin compras → usa precio del catalogo (manual)
- Con compras → usa promedio ponderado
- Indicador "WAC" en pagina de insumos
- Modal historial de precios: WAC, ultimo, min/max, tabla de compras

### Precio bidireccional + config
- Click en precio final → editar → margen se recalcula
- Margen decimal (50.5%, no solo enteros)
- Config en perfil: decimales/enteros/variable
- Modal de eleccion de precio al guardar (3 opciones)

### UX premium
- Cotizador: acordeon Airbnb, sidebar booking-card sticky
- Tokens: text-sm, py-2.5, Apple minimal
- Inputs sin spinners, CustomSelect everywhere
- z-index: dropdowns z-60 > InfoTips z-40
- Mobile: padding responsive, flex-wrap, max-w inputs
- overflow-x: clip (no hidden, permite sticky)
- Bottom padding pb-16/pb-20

## Deploy
- Frontend: GitHub Pages con dominio custom kudi.nodumstudio.com
- Backend: Docker en Contabo VPS con Traefik
- Cloudinary env vars en container Docker
