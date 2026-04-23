# Plan Maestro - Cotizador Nodum

## Visión

Plataforma web para cotizar productos (principalmente repostería/gastronomía) calculando costfood automáticamente a partir de catálogos de insumos y materiales del usuario. Cada cliente tiene su propia cuenta con datos fiscales peruanos (RUC, IGV).

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 + React Router |
| Backend | Express.js + Node.js |
| Base de datos | PostgreSQL |
| Auth | DNI/email + contraseña + JWT (12h) |
| API externa | PeruAPI (consulta RUC) |
| Deploy front | GitHub Pages |
| Deploy back | Docker en Contabo VPS |
| Design system | Reciclado de Space AMAS (zinc-900, zinc-800, tokens sólidos) |

## Grafo de Dependencias

```
FASE 0 (Fundación) ─────┬──► FASE 1 (Auth & Onboarding)──────────────┐
                         │                                             │
                         ├──► FASE 2 (Catálogos) ──┬──► FASE 3 (Cotizador Core) ──► FASE 5 (Historial)
                         │                         │                   │
                         │                         └──► FASE 4 (Predeterminados)───┘
                         │                                             │
                         └─────────────────────────────────────────────┴──► FASE 6 (Deploy & QA)
```

## Ejecución Paralela

| Ventana | Qué corre en paralelo |
|---------|----------------------|
| **V1** | FASE 0 (todo secuencial - es la base) |
| **V2** | FASE 1 (Auth) ║ FASE 2 (Catálogos) — ambas solo dependen de FASE 0 |
| **V3** | FASE 3 (Cotizador) ║ FASE 4 (Predeterminados) — dependen de FASE 2 |
| **V4** | FASE 5 (Historial) — depende de FASE 3 |
| **V5** | FASE 6 (Deploy & QA) — depende de todo |

## Modelo de Agentes por Fase

```
┌─────────────────────────────────────────────────────────┐
│                   ORQUESTADOR MAESTRO                    │
│  (supervisa todas las fases, maneja dependencias)        │
└──────────┬──────────┬──────────┬──────────┬─────────────┘
           │          │          │          │
     ┌─────▼────┐ ┌───▼────┐ ┌──▼───┐ ┌───▼────┐
     │SUPERVISOR│ │SUPERV. │ │SUP.  │ │ SUP.   │
     │ FASE N   │ │FASE N+1│ │QA    │ │CORREC. │
     └──┬───┬───┘ └──┬──┬──┘ └──┬───┘ └───┬────┘
        │   │        │  │       │          │
     ┌──▼┐ ┌▼──┐  ┌──▼┐┌▼──┐  Tests   ◄──Fix──┘
     │W1 │ │W2 │  │W3 ││W4 │   │
     │BE │ │FE │  │BE ││FE │   └──► Si error → Corrector
     └───┘ └───┘  └───┘└───┘
```

### Roles de agentes

| Rol | Descripción |
|-----|------------|
| **Orquestador** | Controla el flujo global, lanza fases cuando dependencias se cumplen |
| **Supervisor de Fase** | Coordina las tareas dentro de su fase, reporta progreso |
| **Worker Backend (WBE)** | Escribe código del servidor (rutas, controllers, queries) |
| **Worker Frontend (WFE)** | Escribe código del cliente (componentes, páginas, hooks) |
| **QA Tester** | Ejecuta tests, valida que el código funcione, reporta errores |
| **Corrector** | Recibe errores del QA, los corrige, devuelve al QA para re-test |

## Fases Detalladas

| Fase | Archivo | Tareas | Agentes |
|------|---------|--------|---------|
| 0 | `01-FASE-0-FUNDACION.md` | 8 | 2 workers |
| 1 | `02-FASE-1-AUTH.md` | 12 | 2 workers + QA |
| 2 | `03-FASE-2-CATALOGOS.md` | 10 | 2 workers + QA |
| 3 | `04-FASE-3-COTIZADOR.md` | 14 | 2 workers + QA |
| 4 | `05-FASE-4-PREDETERMINADOS.md` | 8 | 2 workers + QA |
| 5 | `06-FASE-5-HISTORIAL.md` | 8 | 2 workers + QA |
| 6 | `07-FASE-6-DEPLOY.md` | 10 | 2 workers + QA |

## Documentos de Referencia

| Archivo | Contenido |
|---------|----------|
| `08-ESQUEMA-BD.md` | SQL completo de todas las tablas |
| `09-QUERIES.md` | Todas las queries por endpoint |
| `10-FLUJOS.md` | Diagramas de flujo de cada feature |
