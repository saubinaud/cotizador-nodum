import { useMemo } from 'react';

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18, tipoPresentacion = 'unidad', unidadesPorProducto = 1) {
  return useMemo(() => {
    // Cost for THE WHOLE PRODUCT from preparations
    const costoInsumosProducto = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        return s + (Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0);
      }, 0);

      const rendimiento = Number(prep.capacidad) || 0;
      const cantParaProducto = Number(prep.cantidad_por_unidad) || 0;

      if (rendimiento > 0 && cantParaProducto > 0) {
        return sum + (prepCost / rendimiento) * cantParaProducto;
      }
      return sum + prepCost; // no porciones = full prep cost is the product cost
    }, 0);

    const unidades = tipoPresentacion === 'entero' ? (unidadesPorProducto || 1) : 1;

    // Cost per individual portion
    const costoInsumosPorPorcion = unidades > 1 ? costoInsumosProducto / unidades : costoInsumosProducto;

    // Empaque costs
    const costoEmpaqueEntero = materiales
      .filter((m) => (m.empaque_tipo || 'entero') === 'entero')
      .reduce((sum, mat) => sum + (Number(mat.precio) || 0) * (Number(mat.cantidad) || 0), 0);
    const costoEmpaqueUnidad = materiales
      .filter((m) => m.empaque_tipo === 'unidad')
      .reduce((sum, mat) => sum + (Number(mat.precio) || 0) * (Number(mat.cantidad) || 0), 0);

    // WHOLE PRODUCT pricing
    const costoNetoProducto = costoInsumosProducto + costoEmpaqueEntero + (costoEmpaqueUnidad * unidades);
    const margenDecimal = Number(margen) / 100;
    const igvDecimal = Number(igvRate) / 100;
    const precioVentaProducto = costoNetoProducto > 0 && margenDecimal < 1 ? costoNetoProducto / (1 - margenDecimal) : costoNetoProducto;
    const precioFinalProducto = precioVentaProducto * (1 + igvDecimal);

    // PER PORTION pricing
    const costoNetoPorcion = costoInsumosPorPorcion + costoEmpaqueUnidad;
    const precioVentaPorcion = costoNetoPorcion > 0 && margenDecimal < 1 ? costoNetoPorcion / (1 - margenDecimal) : costoNetoPorcion;
    const precioFinalPorcion = precioVentaPorcion * (1 + igvDecimal);

    // Return values that the backend/save needs (use product-level values)
    return {
      costoInsumos: costoInsumosProducto,
      costoInsumosProducto,
      costoInsumosPorPorcion,
      costoEmpaqueEntero,
      costoEmpaqueUnidad,
      costoEmpaque: costoEmpaqueEntero + (costoEmpaqueUnidad * unidades),
      costoNeto: costoNetoProducto,
      costoNetoPorcion,
      margen: Number(margen),
      unidades,
      precioVenta: precioVentaProducto,
      precioVentaPorcion,
      igvRate: Number(igvRate),
      igvMonto: precioVentaProducto * igvDecimal,
      precioFinal: precioFinalProducto,
      precioFinalPorcion,
    };
  }, [preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto]);
}
