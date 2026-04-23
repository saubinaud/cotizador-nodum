import { useMemo } from 'react';

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18) {
  return useMemo(() => {
    const costoInsumos = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        return s + (Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0);
      }, 0);
      return sum + prepCost;
    }, 0);

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
      costoInsumos,
      costoEmpaque,
      costoNeto,
      margen: Number(margen),
      precioVenta,
      igvRate: Number(igvRate),
      igvMonto,
      precioFinal,
    };
  }, [preparaciones, materiales, margen, igvRate]);
}
