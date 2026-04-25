import { useMemo } from 'react';

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18, tipoPresentacion = 'unidad', unidadesPorProducto = 1) {
  return useMemo(() => {
    // Cost per unit from porciones
    const costoInsumosPorUnidad = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        return s + (Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0);
      }, 0);
      const rendimiento = Number(prep.capacidad) || 0;
      const cantPorUnidad = Number(prep.cantidad_por_unidad) || 0;
      if (rendimiento > 0 && cantPorUnidad > 0) {
        return sum + (prepCost / rendimiento) * cantPorUnidad;
      }
      return sum + prepCost;
    }, 0);

    const multiplicador = tipoPresentacion === 'entero' ? (unidadesPorProducto || 1) : 1;
    const costoInsumos = costoInsumosPorUnidad * multiplicador;

    // Separate empaque costs
    const costoEmpaqueEntero = materiales
      .filter((m) => (m.empaque_tipo || 'entero') === 'entero')
      .reduce((sum, mat) => sum + (Number(mat.precio) || 0) * (Number(mat.cantidad) || 0), 0);

    const costoEmpaqueUnidad = materiales
      .filter((m) => m.empaque_tipo === 'unidad')
      .reduce((sum, mat) => sum + (Number(mat.precio) || 0) * (Number(mat.cantidad) || 0), 0);

    const costoEmpaque = costoEmpaqueEntero + (costoEmpaqueUnidad * multiplicador);

    const costoNeto = costoInsumos + costoEmpaque;
    const margenDecimal = Number(margen) / 100;
    const precioVenta = costoNeto > 0 && margenDecimal < 1 ? costoNeto / (1 - margenDecimal) : costoNeto;
    const igvDecimal = Number(igvRate) / 100;
    const igvMonto = precioVenta * igvDecimal;
    const precioFinal = precioVenta + igvMonto;

    // Per-unit pricing (for "entero" products)
    const costoNetoUnidad = costoInsumosPorUnidad + costoEmpaqueUnidad;
    const precioVentaUnidad = costoNetoUnidad > 0 && margenDecimal < 1 ? costoNetoUnidad / (1 - margenDecimal) : costoNetoUnidad;
    const precioFinalUnidad = precioVentaUnidad * (1 + igvDecimal);

    return {
      costoInsumosPorUnidad,
      costoInsumos,
      costoEmpaqueEntero,
      costoEmpaqueUnidad,
      costoEmpaque,
      costoNeto,
      margen: Number(margen),
      multiplicador,
      precioVenta,
      igvRate: Number(igvRate),
      igvMonto,
      precioFinal,
      // Per-unit
      costoNetoUnidad,
      precioVentaUnidad,
      precioFinalUnidad,
    };
  }, [preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto]);
}
