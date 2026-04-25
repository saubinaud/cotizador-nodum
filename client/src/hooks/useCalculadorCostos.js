import { useMemo } from 'react';

const CONVERSIONES = {
  g: { kg: 1000, g: 1, mg: 0.001, oz: 28.3495 },
  kg: { g: 0.001, kg: 1, oz: 0.0283495 },
  ml: { L: 1000, ml: 1, l: 1000 },
  L: { ml: 0.001, L: 1, l: 1 },
  l: { ml: 0.001, L: 1, l: 1 },
  uni: { uni: 1 },
  oz: { g: 0.0352739, kg: 35.274, oz: 1 },
};

function convertirUnidad(valor, deUnidad, aUnidad) {
  if (!deUnidad || !aUnidad || deUnidad === aUnidad) return valor;
  const grupo = CONVERSIONES[aUnidad];
  if (grupo && grupo[deUnidad]) return valor * grupo[deUnidad];
  const grupoRev = CONVERSIONES[deUnidad];
  if (grupoRev && grupoRev[aUnidad]) return valor / grupoRev[aUnidad];
  return valor;
}

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18, tipoPresentacion = 'unidad', unidadesPorProducto = 1, margenPorcion = null) {
  return useMemo(() => {
    // Cost for THE WHOLE PRODUCT from preparations
    const costoInsumosProducto = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        return s + (Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0);
      }, 0);

      const rendimiento = Number(prep.capacidad) || 0;
      const cantParaProducto = Number(prep.cantidad_por_unidad) || 0;
      const cantEnUnidadPrep = convertirUnidad(cantParaProducto, prep.porcion_unidad || prep.unidad || '', prep.unidad || '');

      if (rendimiento > 0 && cantEnUnidadPrep > 0) {
        return sum + (prepCost / rendimiento) * cantEnUnidadPrep;
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

    // PER PORTION pricing (can have its own margin)
    const costoNetoPorcion = costoInsumosPorPorcion + costoEmpaqueUnidad;
    const margenPorcionDecimal = margenPorcion !== null ? Number(margenPorcion) / 100 : margenDecimal;
    const precioVentaPorcion = costoNetoPorcion > 0 && margenPorcionDecimal < 1 ? costoNetoPorcion / (1 - margenPorcionDecimal) : costoNetoPorcion;
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
      margenPorcion: margenPorcion !== null ? Number(margenPorcion) : Number(margen),
      unidades,
      precioVenta: precioVentaProducto,
      precioVentaPorcion,
      igvRate: Number(igvRate),
      igvMonto: precioVentaProducto * igvDecimal,
      precioFinal: precioFinalProducto,
      precioFinalPorcion,
    };
  }, [preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto, margenPorcion]);
}
