# Plan Maestro — Giro de Negocio (Multi-rubro)

> El sistema adapta su terminología según el tipo de negocio del usuario.
> La lógica de costeo es idéntica — solo cambian las palabras.

---

## CONCEPTO

Cuando un usuario se registra o configura su perfil, selecciona su **giro de negocio** (ej: "Panadería", "Jabones artesanales", "Confección textil"). A partir de eso, toda la UI adapta sus etiquetas:

- "Insumos" → "Ingredientes" (gastronomía) / "Materias primas" (cosméticos) / "Telas e hilos" (textil)
- "Preparaciones" → "Recetas" / "Fórmulas" / "Patronaje"
- "Productos" → "Platos" / "Artículos" / "Prendas"
- "Materiales" → "Empaque" / "Envase" / "Presentación"
- "Ficha técnica" → "Receta estándar" / "Fórmula" / "Ficha de producción"
- "Merma" → "Merma" / "Desperdicio" / "Retazo"

---

## ARQUITECTURA DE BD

### Enfoque: Tabla de configuración + JSON de términos

NO crear una tabla por cada rubro. En su lugar:

```sql
-- Catálogo de giros de negocio (global, readonly)
CREATE TABLE IF NOT EXISTS giros_negocio (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,       -- 'panaderia', 'cosmeticos', 'textil'
  sector VARCHAR(50) NOT NULL,              -- 'Alimentos y Bebidas', 'Cosméticos', etc.
  nombre VARCHAR(100) NOT NULL,             -- 'Panadería y Pastelería'
  icono VARCHAR(30),                        -- 'cake', 'sparkles', 'shirt'
  terminos JSONB NOT NULL,                  -- mapeo de términos
  orden INTEGER NOT NULL DEFAULT 0
);
```

### El campo `terminos` (JSONB)

```json
{
  "insumos": "Ingredientes",
  "insumos_singular": "Ingrediente",
  "preparaciones": "Recetas",
  "preparaciones_singular": "Receta",
  "productos": "Productos",
  "productos_singular": "Producto",
  "materiales": "Empaque",
  "materiales_singular": "Material de empaque",
  "ficha_tecnica": "Receta estándar",
  "merma": "Merma",
  "desmedro": "Desmedro",
  "margen": "Margen",
  "tanda": "Tanda",
  "rendimiento": "Rendimiento",
  "preparacion_base": "Preparación base",
  "costo_produccion": "Costo de producción"
}
```

### Columna en usuarios

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS giro_negocio_id INTEGER REFERENCES giros_negocio(id);
```

### Cómo se usa en el frontend

1. Al login/me, el backend devuelve `giro_negocio` con sus `terminos`
2. El frontend carga los términos en un contexto React (`useTerminos()`)
3. Cada label en la UI usa `t.insumos` en vez de hardcodear "Insumos"

```jsx
// Context
const TerminosContext = createContext({});
export function useTerminos() { return useContext(TerminosContext); }

// En Layout/App:
<TerminosContext.Provider value={user?.giro_terminos || DEFAULTS}>
  <Outlet />
</TerminosContext.Provider>

// En cualquier página:
const t = useTerminos();
<h1>{t.insumos}</h1>  // "Ingredientes" o "Materias primas" según el giro
```

### Términos default (sin giro seleccionado)

```json
{
  "insumos": "Insumos",
  "preparaciones": "Preparaciones",
  "productos": "Productos",
  "materiales": "Materiales",
  "ficha_tecnica": "Ficha técnica",
  "merma": "Merma",
  "desmedro": "Desmedro",
  "margen": "Margen",
  "tanda": "Tanda",
  "rendimiento": "Rendimiento"
}
```

---

## CATÁLOGO DE GIROS (Seed inicial)

### Sector: Alimentos y Bebidas
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| panaderia | Panadería y Pastelería | Ingredientes | Recetas | Productos | Empaque | Receta estándar |
| restaurante | Restaurante / Cocina | Ingredientes | Recetas | Platos | Descartables | Receta estándar |
| catering | Catering y Eventos | Ingredientes | Recetas | Servicios | Montaje | Costeo por evento |
| food_truck | Food Truck / Comida rápida | Ingredientes | Recetas | Ítems del menú | Envases | Receta estándar |
| heladeria | Heladería | Ingredientes | Fórmulas | Sabores | Envases | Fórmula |
| chocolateria | Chocolatería / Confitería | Ingredientes | Recetas | Bombones | Presentación | Fórmula |
| cerveceria | Cervecería Artesanal | Ingredientes | Recetas de cocción | Estilos | Botellas/etiquetas | Receta cervecera |
| cafeteria | Cafetería de Especialidad | Ingredientes | Métodos | Bebidas | Vasos/mangas | Receta de barra |
| bebidas | Jugos y Bebidas | Ingredientes | Recetas | Bebidas | Vasos/envases | Receta |
| alimentos_proc | Procesadora de Alimentos | Materia prima | Fórmulas | Producto terminado | Empaque | Ficha técnica |

### Sector: Cosméticos y Cuidado Personal
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| jabones | Jabones Artesanales | Materias primas | Fórmulas | Jabones | Empaque | Fórmula |
| cosmeticos | Cremas y Cosméticos | Materias primas | Fórmulas | Productos | Envases | Fórmula |
| perfumeria | Perfumería | Esencias | Fórmulas | Fragancias | Frascos | Fórmula |
| maquillaje | Maquillaje Artesanal | Pigmentos | Fórmulas | Productos | Compactos | Fórmula de color |

### Sector: Artesanías
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| velas | Velas Aromáticas | Materias primas | Fórmulas | Velas | Recipientes | Fórmula |
| joyeria | Joyería y Bisutería | Materiales | Diseños | Piezas | Presentación | Ficha de diseño |
| ceramica | Cerámica | Materiales | Procesos | Piezas | Empaque | Ficha de pieza |
| cuero | Marroquinería / Cuero | Materiales | Patronaje | Artículos | Presentación | Ficha de producto |
| madera | Carpintería / Madera | Materiales | Planos | Muebles/piezas | Embalaje | Plano de producción |

### Sector: Productos de Limpieza
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| limpieza | Productos de Limpieza | Químicos | Fórmulas | Productos | Envases | Fórmula |

### Sector: Agroindustria
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| conservas | Mermeladas y Conservas | Materia prima | Recetas | Conservas | Frascos/etiquetas | Receta |
| salsas | Salsas y Aderezos | Materia prima | Fórmulas | Salsas | Botellas | Fórmula |
| cafe_cacao | Café y Cacao | Materia prima | Procesos | Producto terminado | Bolsas/etiquetas | Perfil de tueste |

### Sector: Textil y Moda
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| confeccion | Confección / Taller | Telas e hilos | Patronaje | Prendas | Presentación | Ficha de prenda |
| serigrafia | Serigrafía / Estampado | Tintas/blanks | Procesos | Artículos | Empaque | Ficha de diseño |
| tejido | Tejido y Crochet | Hilos/lanas | Patrones | Piezas | Empaque | Patrón |

### Sector: Salud y Suplementos
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| suplementos | Suplementos Naturales | Extractos | Fórmulas | Productos | Frascos | Fórmula |
| herbolaria | Herbolaria | Hierbas | Mezclas | Infusiones | Empaque | Fórmula |

### Sector: Mascotas
| código | nombre | insumos → | preparaciones → | productos → | materiales → | ficha → |
|--------|--------|-----------|----------------|-------------|-------------|---------|
| pet_food | Alimento para Mascotas | Ingredientes | Fórmulas | Alimentos | Empaque | Fórmula nutricional |
| pet_accesorios | Accesorios para Mascotas | Materiales | Patronaje | Accesorios | Empaque | Ficha de producto |

### Otro
| código | nombre | todos los términos default |
|--------|--------|---------------------------|
| otro | Otro / General | Insumos, Preparaciones, Productos, Materiales, Ficha técnica |

**Total: 30 giros de negocio**

---

## FLUJO UX

### En onboarding (nuevo usuario)

```
Paso 1: Datos básicos (nombre, email, empresa)
Paso 2: "¿Qué tipo de negocio tienes?"
         → Grid de iconos con los sectores
         → Al seleccionar sector, muestra sub-opciones
         → Al seleccionar giro, preview de los términos:
           "En tu negocio llamaremos:
            Ingredientes → lo que compras
            Recetas → cómo lo preparas
            Productos → lo que vendes"
Paso 3: País + moneda
Paso 4: Contraseña → Listo
```

### En perfil (cambiar después)

```
Sección "Mi negocio"
  Giro: [selector dropdown con todos los giros]
  Preview de términos adaptados
  Botón "Cambiar" → recarga la UI con nuevos labels
```

---

## IMPACTO EN CÓDIGO

### Backend
| Archivo | Cambio |
|---------|--------|
| `migrate.js` | Tabla `giros_negocio` + seed 30 registros + columna en usuarios |
| `auth.js` | GET /me incluye terminos del giro |
| `auth.js` | PUT /perfil acepta giro_negocio_id |
| `onboarding.js` | Acepta giro_negocio_id |

### Frontend
| Archivo | Cambio |
|---------|--------|
| `context/TerminosContext.jsx` | NUEVO — provider + hook useTerminos() |
| `App.jsx` | Wrappear con TerminosProvider |
| `Layout.jsx` | Labels del sidebar usan t.insumos, t.preparaciones, etc. |
| `InsumosPage.jsx` | Título: t.insumos |
| `MaterialesPage.jsx` | Título: t.materiales |
| `PrepPredPage.jsx` | Título: t.preparaciones |
| `CotizadorPage.jsx` | Labels adaptados |
| `DashboardPage.jsx` | Labels adaptados |
| `FichaTecnicaPage.jsx` | Título: t.ficha_tecnica |
| `PerdidasPage.jsx` | Labels adaptados |
| `OnboardingPage.jsx` | Paso de selección de giro |
| `PerfilPage.jsx` | Selector de giro |

### Lo que NO cambia
- Nombres de tablas en BD (siempre `insumos`, `productos`, etc.)
- Nombres de endpoints API
- Lógica de cálculo (useCalculadorCostos)
- P&L, flujo de caja, facturación

---

## IMPLEMENTACIÓN POR FASES

### Fase 1: BD + seed + backend (1-2h)
- Tabla giros_negocio + seed 30 registros
- Columna giro_negocio_id en usuarios
- GET /me devuelve terminos
- Endpoint GET /giros para el selector

### Fase 2: Contexto React + sidebar (1-2h)
- TerminosContext con defaults
- Layout.jsx usa t.* en sidebar labels
- Las páginas principales usan t.* en títulos

### Fase 3: Onboarding + Perfil (1h)
- Selector de giro en onboarding
- Selector en perfil
- Preview de términos

**Total: ~4-5h**
