# Design System — Cotizador NODUM

> Inspirado en Apple (minimal, cada pixel tiene proposito), Airbnb (limpio, espacioso) y Seiko Presage Cocktail (colores profundos, elegantes).

## Filosofia

- **Apple**: A dos clicks de distancia. Sin ruido visual.
- **Airbnb**: Secciones separadas por lineas, no por cajas. Cards limpias.
- **Seiko Presage**: Colores ricos y profundos, no pasteles lavados.
- **Target**: MYPEs gastronomicas — facil y bonito, no intimidante.

## Tipografia

```
Font: System UI (ui-sans-serif, system-ui, sans-serif)
      — Nativa, rapida, familiar en cada dispositivo
      — body: antialiased

Jerarquia:
  h1 (pagina): text-2xl font-bold text-stone-900
  h3 (seccion): text-lg font-semibold text-stone-900
  body: text-sm text-stone-800
  label: text-xs font-semibold text-stone-500 tracking-wide
  caption: text-[10px] text-stone-400
```

## Paleta de colores

### Fondo y superficies
```
body:     #f7f7f7 (Apple gray)
card:     #ffffff (puro blanco, se destaca del fondo)
sidebar:  #ffffff (con borde stone-100)
input bg: #ffffff
hover:    stone-50 (#fafaf9)
```

### Texto
```
primary:   stone-800 (#292524)
secondary: stone-500 (#78716c)
muted:     stone-400 (#a8a29e)
disabled:  stone-300
```

### Bordes
```
card:      stone-200 (#e7e5e4)
input:     stone-300 (#d6d3d1)
divider:   stone-100 (#f5f5f4)
focus:     stone-500 (se oscurece, no cambia color — estilo Airbnb)
```

### Accent (temas — CSS variables)

| Tema | Var | Color | Hover | Light | Inspiracion |
|------|-----|-------|-------|-------|-------------|
| Coral | `--accent` | #e8590c | #c2410c | #fff7ed | Seiko Manhattan |
| Lavanda | `--accent` | #4f46e5 | #4338ca | #eef2ff | Seiko Blue Moon |
| Menta | `--accent` | #0f766e | #115e59 | #f0fdfa | Seiko Mockingbird |

### Funcionales
```
success:  var(--success) = #0f766e (teal profundo)
danger:   rose-600 (#e11d48)
warning:  amber-600
```

### Badges (sobre fondo claro)
```
activo:    bg-teal-50 text-teal-600
inactivo:  bg-rose-50 text-rose-600
pendiente: bg-amber-50 text-amber-600
admin:     bg-violet-50 text-violet-600
```

## Espaciado (base 4px)

```
Sidebar nav links:  px-4 py-3
Card padding:       p-6
Section gap:        gap-8 (entre secciones del cotizador)
Grid gap:           gap-4 (dentro de formularios)
Main content:       p-5 (mobile) / p-8 (desktop)
Label margin:       mb-1.5
```

## Componentes

### Botones
```
Primary:   px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-semibold
Secondary: px-5 py-2.5 bg-white border-stone-300 text-stone-700 rounded-lg
Ghost:     px-3 py-2 text-stone-500 hover:bg-stone-100 rounded-lg
Danger:    px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg
Icon:      p-2 text-stone-400 hover:bg-stone-100 rounded-lg

Transicion: duration-150 (rapida, no lenta)
Active:     active:scale-[0.97] (micro feedback)
```

### Inputs
```
px-4 py-2.5 bg-white border-stone-300 rounded-lg text-sm
Focus:     border-stone-500 (oscurece, sin ring — Airbnb)
Placeholder: text-stone-400
Sin spinners: CSS global oculta flechas de number inputs
```

### CustomSelect (reemplaza todos los <select> nativos)
```
Normal:  px-4 py-2.5 text-sm — misma altura que inputs
Compact: px-2 py-1.5 text-xs — para selectores de unidad (g/kg/ml)
Dropdown: shadow-lg, rounded-lg, z-50
Selected: text-[var(--accent)] bg-[var(--accent-light)]
```

### Cards
```
bg-white border-stone-200 rounded-xl
Sin shadow por defecto (Apple: limpio)
Hover: shadow-md (sutil, Airbnb)
```

### Tablas
```
th: text-[11px] font-semibold uppercase tracking-wider text-stone-400
td: text-sm py-3.5
tr: border-stone-100, hover:bg-stone-50/50
```

### Badges
```
rounded-full (pill)
text-[10px] font-semibold
px-2.5 py-1
```

## Layout

### Sidebar
```
Expandido: w-56 (224px)
Colapsado: w-16 (64px) — solo iconos con tooltip
Persiste en localStorage
Toggle: ChevronLeft/Right al fondo
Desktop: fijo a la izquierda
Mobile: drawer overlay
```

### Grid del cotizador
```
max-w-7xl mx-auto
xl:grid-cols-3 gap-8
  Izquierda (2 cols): formulario
  Derecha (1 col): resumen sticky

Header producto (entero): 9fr | 7fr | 4fr  (≈45/35/20%)
Header producto (unidad): 3fr | 2fr        (≈60/40%)

Columnas tabla insumos: w-1/3 | w-1/5 | auto | auto | w-10
```

### Preparaciones — Acordeon Airbnb
```
UN solo card con divide-y divide-stone-100
Cada prep: header clickeable (nombre + costo + chevron)
Colapsado: solo nombre + costo visible
Expandido: campos + tabla de insumos
```

### Resumen sidebar — Airbnb booking card
```
Card sticky (xl:top-6)
Secciones separadas por border-b border-stone-100
Precio final: text-2xl font-bold text-stone-900
Precio sugerido: text-[var(--success)]
Boton guardar: full-width al fondo
```

## Temas

Guardados en `localStorage` key `nodum_theme`.
Aplicados via `data-theme` en `<html>`.
CSS variables en `:root` y `[data-theme="..."]`.

Selector visual en Perfil: 3 circulos de color.

## InfoTips (tooltips informativos)

Icono `?` al lado de titulos de seccion. Hover muestra tooltip explicativo.

```
Estilo: w-4 h-4 rounded-full bg-stone-100 text-stone-400 text-[10px]
Hover:  bg-[var(--accent)] text-white
Tooltip: bg-stone-800 text-white text-xs rounded-lg w-56
Flecha: border trick apuntando hacia abajo
```

Donde ponerlos:
- Al lado de titulos de seccion (h3): Producto, Preparaciones, Composicion, Empaque, Resumen
- Al lado de labels complejos: Presentacion, Margen
- NO en cada campo — solo donde el concepto no es obvio

## Modales — Airbnb listing style

```
Overlay:   bg-black/40 backdrop-blur-sm
Container: bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto
Imagen:    aspect-[3/1] rounded-t-2xl (banner ancho)
Padding:   p-6
Tablas:    border border-stone-100 rounded-lg, header bg-stone-50
Acciones:  flex gap-3 mt-6 (Editar primary + Cerrar secondary)
```

## Listas — Acordeon en card unico

```
Container: cx.card + divide-y divide-stone-100
Item:      p-5, header clickeable con chevron
Colapsado: nombre + costo visible
Expandido: mini-tabla bordeada con bg-stone-50 header
```

Aplicado en: Preparaciones (cotizador), PrepPred, EmpaquePred, Dashboard historial.

## Anti-patrones (lo que NO hacer)

- NO usar shadow en cards por defecto (solo en hover)
- NO usar select nativos del OS (siempre CustomSelect)
- NO usar spinners en inputs numericos
- NO usar colores pasteles lavados (usar tonos profundos Presage)
- NO usar tipografias decorativas (system-ui es suficiente)
- NO numerar pasos (los titulos hablan solos)
- NO agregar subtitulos descriptivos en paginas (solo InfoTips)
- NO duplicar botones (guardar solo en un lugar)
- NO usar ring de color en focus (oscurecer borde — Airbnb)
- NO usar rounded-full en botones (solo en badges)
- NO usar porcentajes en grids con gap (usar fr)
- NO poner InfoTips en cada campo (solo en conceptos no obvios)
