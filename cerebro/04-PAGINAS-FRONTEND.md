# Paginas del Frontend

## Login (`/login`)
- Email + password
- Redirige a dashboard al loguearse

## Onboarding (`/onboarding?token=xxx`)
- Registro de nuevos usuarios via link generado por admin
- Completa: password, RUC, razon social, IGV rate

## Dashboard (`/dashboard`)
- **Vista galeria** (por defecto): Cards tipo Notion con imagen, nombre, margen, precio
- **Vista tabla**: Lista clasica con columnas
- Click en producto: abre **modal de detalle** con receta completa (insumos, materiales, costos)
- Acciones: editar, duplicar, historial, eliminar
- **Exportar Excel**: descarga CSV con recetas completas (resumen + detalle por producto)
- **Historial**: modal con versiones, comparacion antes/despues, restaurar con confirmacion

## Cotizador (`/cotizador` y `/cotizador/:id`)
5 pasos numerados con tooltips informativos:

1. **Producto**: nombre, presentacion (unidad/entero), unidades por producto, imagen URL
2. **Preparaciones**: recetas base con insumos y rendimiento. Puede cargar predeterminadas
3. **Composicion**: cuanto de cada preparacion va en el producto completo. Calcula "productos por tanda" y costo
4. **Empaque**: materiales separados por tipo (producto entero vs por porcion)
5. **Resumen**: costos, margen, precio final + precio sugerido (redondeo comercial)

Para productos enteros: muestra doble precio (entero + por porcion)

## Insumos (`/insumos`)
- CRUD de insumos (nombre, presentacion, unidad, precio)
- Busqueda
- Edicion inline
- Calculo automatico de costo unitario
- Al editar precio: recalcula automaticamente productos que lo usan

## Materiales (`/materiales`)
- Igual que insumos pero para materiales de empaque
- Incluye campo proveedor

## Prep. Predeterminadas (`/preparaciones-predeterminadas`)
- Plantillas reutilizables de preparaciones con insumos
- Se pueden cargar en el cotizador con un click
- Unidad de capacidad como dropdown

## Empaques Predeterminados (`/empaques-predeterminados`)
- Plantillas de empaques con materiales

## Proyeccion (`/proyeccion`)
- Meta de ganancia en soles
- Peso % por producto (distribucion personalizada o igual)
- Calcula cantidades a vender para llegar a la meta
- Modo manual: ingresa cantidades y ve ingreso/ganancia

## Mi Actividad (`/actividad`)
- Timeline de actividad del usuario
- CRUD logs (crear/editar/eliminar insumos, materiales)
- Versiones de productos con opcion de restaurar (2 clicks de confirmacion)
- Click en producto navega al cotizador

## Perfil (`/perfil`)
- Ver datos del usuario
- Editar: nombre, nombre comercial, RUC, razon social, IGV rate
- Cambiar password

## Admin: Usuarios (`/admin/usuarios`)
- Lista de usuarios con rol, estado, permisos
- Crear usuario con rol + modulos de acceso
- Link de onboarding persistente para usuarios pendientes
- Editar permisos (modal con checkboxes por modulo)
- Suspender/reactivar/eliminar usuarios

## Admin: Actividad (`/admin/actividad`)
- Log global de actividad de todos los usuarios
