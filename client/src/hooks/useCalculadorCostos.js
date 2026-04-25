import { useMemo } from 'react';

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18, tipoPresentacion = 'unidad', unidadesPorProducto = 1) {
  return useMemo(() => {
    // Calculate cost per unit based on porciones
    const costoInsumosPorUnidad = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        return s + (Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0);
      }, 0);

      const rendimiento = Number(prep.capacidad) || 0;
      const cantPorUnidad = Number(prep.cantidad_por_unidad) || 0;

      // If porciones defined: cost = (prepCost / rendimiento) * cantPorUnidad
      // If not defined: use full prep cost (backward compatible)
      if (rendimiento > 0 && cantPorUnidad > 0) {
        return sum + (prepCost / rendimiento) * cantPorUnidad;
      }
      return sum + prepCost;
    }, 0);

    const multiplicador = tipoPresentacion === 'entero' ? (unidadesPorProducto || 1) : 1;
    const costoInsumos = costoInsumosPorUnidad * multiplicador;

    const costoEmpaque = materiales.reduce((sum, mat) => {
      return sum + (Number(mat.precio) || 0) * (Number(mat.cantidad) || 0);
    }, 0);

    const costoNeto = costoInsumos + costoEmpaque;
    const margenDecimal = Number(margen) / 100;
    const precioVenta = costoNeto > 0 ? costoNeto / (1 - margenDecimal) : 0;
    const igvDecimal = Number(igvRate) / 100;
    const igvMonto = precioVenta * igvDecimal;
    const precioFinal = precioVenta + igvMonto;

    return {
      costoInsumosPorUnidad,
      multiplicador,
      costoInsumos,
      costoEmpaque,
      costoNeto,
      margen: Number(margen),
      precioVenta,
      igvRate: Number(igvRate),
      igvMonto,
      precioFinal,
    };
  }, [preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto]);
}
