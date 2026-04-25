# Pendientes y Features Futuras

## Prioridad alta

- [ ] **Unidades inteligentes**: si un insumo es "mantequilla 100g", al poner 2 unidades deberia calcular automaticamente 200g
- [ ] **Auto-guardado**: guardar preparaciones automaticamente al completarlas
- [ ] **Permisos efectivos en tiempo real**: que al cambiar permisos de un usuario se actualicen sin re-login
- [ ] **Validacion de porciones**: alertar si las porciones no cuadran con el rendimiento
- [ ] **Cambiar password de PostgreSQL**: el URI se expuso accidentalmente (GitGuardian alerta)

## Prioridad media

- [ ] **PWA**: hacer la app instalable en movil (manifest.json + service worker)
- [ ] **Exportar Excel por producto**: descargar receta individual como PDF o Excel
- [ ] **Copiar preparacion a predeterminada**: desde el cotizador, guardar una prep como template
- [ ] **Busqueda global**: buscar en insumos, materiales y productos desde un solo lugar
- [ ] **Favoritos/categorias**: organizar productos por categoria
- [ ] **Multi-moneda**: soporte para dolares ademas de soles

## Prioridad baja

- [ ] **Modo offline**: cache de datos para trabajar sin internet
- [ ] **Notificaciones push**: alertas cuando cambian precios de insumos
- [ ] **Comparar productos**: tabla comparativa de costos entre productos
- [ ] **Graficos**: charts de costos, margenes, tendencias
- [ ] **API publica**: endpoints para integracion con otros sistemas
- [ ] **Multi-idioma**: soporte ingles/espanol

## Bugs conocidos

- [ ] El dropdown de SearchableSelect puede quedar detras de otros elementos en mobile
- [ ] Al restaurar version, solo restaura costos pero no las preparaciones/insumos detallados
- [ ] La sesion no refleja cambios de permisos hasta re-login

## Ideas del usuario (transcripcion)

- Que al crear insumo de "mantequilla 100g" y poner 2 unidades, calcule 200g automaticamente
- Poder ver en el dashboard productos finales con su receta completa
- Mejor adaptacion mobile (responsive)
- Que el sistema proponga precios basados en el mercado o competencia
- Poder armar paquetes/combos de productos
