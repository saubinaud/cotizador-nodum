# Reporte de Bugs — 1 Mayo 2026
> Fuente: Correcciones/correción 1 mayo.pdf
> Módulos: Ingredientes y Recetas Base

---

## BUG #1 — Desplegable de U.M. bloqueado al filtrar con el buscador
- **Módulo**: Ingredientes > Crear / Editar Insumo
- **Problema**: Al buscar un insumo (ej: "cob") y luego intentar abrir el selector de Unidad de Medida, el desplegable no se despliega o queda oculto detrás de otro elemento
- **Causa probable**: z-index del CustomSelect en conflicto con la barra de búsqueda o el overflow del contenedor
- **Fix**: Verificar z-index del dropdown del selector de U.M. dentro de la tabla filtrada

## BUG #2 — Unidades de Medida sin orden lógico en el selector
- **Módulo**: Ingredientes > Selector de Unidad de Medida
- **Orden actual**: g → ml → uni → oz → kg
- **Orden esperado**: g → kg → ml → L → uni → oz
- **Criterio**: Agrupar por categoría (masa: g, kg / volumen: ml, L / otras: uni, oz) y dentro de cada grupo de menor a mayor
- **Fix**: Reordenar el array de opciones en el selector de unidades

## BUG #3 — No es posible guardar un insumo nuevo — Error interno del servidor
- **Módulo**: Ingredientes > Crear Insumo
- **Problema**: Al intentar guardar un nuevo insumo, el sistema muestra "Error interno del servidor" y no se persiste
- **Impacto**: CRÍTICO — bloquea la creación de nuevos ingredientes
- **Causa probable**: Error en el endpoint POST /insumos (validación del payload o campo faltante)
- **Fix**: Revisar logs del backend, verificar campos requeridos, probar POST /insumos directamente

## BUG #4 — Desplegable de U.M. del último insumo se abre fuera de pantalla
- **Módulo**: Ingredientes > Lista de Insumos
- **Problema**: Cuando hay muchos insumos, el selector del último insumo se abre hacia abajo y sale del viewport
- **Comportamiento esperado**: Flip automático (abrir hacia arriba cuando no hay espacio abajo)
- **Fix**: Agregar lógica de flip/collision detection al CustomSelect (calcular posición relativa al viewport)

## BUG #5 — Insumo vinculado a receta base no puede eliminarse — Sin mensaje claro
- **Módulo**: Ingredientes > Eliminar Insumo
- **Problema**: Al eliminar un insumo que está en una receta, el sistema muestra "Error interno del servidor" en vez de explicar que está vinculado
- **Causa raíz**: FK constraint de prep_pred_insumos impide DELETE, pero el error no se maneja
- **Fix**: Opción A (recomendada): verificar si está vinculado antes de eliminar y mostrar "Este insumo está siendo utilizado en la receta 'X'. Retíralo de la receta antes de eliminarlo."
