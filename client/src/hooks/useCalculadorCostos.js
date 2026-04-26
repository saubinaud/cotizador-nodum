import { useMemo } from 'react';

function normU(u) {
  if (!u) return '';
  if (u === 'l') return 'L';
  return u;
}

const FACTORES = {
  'g→kg': 0.001, 'kg→g': 1000,
  'g→oz': 0.03527, 'oz→g': 28.3495,
  'kg→oz': 35.274, 'oz→kg': 0.02835,
  'ml→L': 0.001, 'L→ml': 1000, 'cm→mt': 0.01, 'mt→cm': 100,
};

function convertirUnidad(valor, deUnidad, aUnidad) {
  const de = normU(deUnidad);
  const a = normU(aUnidad);
  if (!de || !a || de === a) return valor;
  const key = `${de}→${a}`;
  if (FACTORES[key]) return valor * FACTORES[key];
  return valor;
}

export function useCalculadorCostos(preparaciones = [], materiales = [], margen = 50, igvRate = 18, tipoPresentacion = 'unidad', unidadesPorProducto = 1, margenPorcion = null) {
  return useMemo(() => {
    // Cost for THE WHOLE PRODUCT from preparations
    const costoInsumosProducto = preparaciones.reduce((sum, prep) => {
      const prepCost = (prep.insumos || []).reduce((s, ins) => {
        const original = normU(ins.unidad_medida);
        const uso = normU(ins.uso_unidad);
        const factor = (uso && original && uso !== original) ? convertirUnidad(1, uso, original) : 1;
        const cu = factor > 0 ? (Number(ins.costo_unitario) || 0) * factor : (Number(ins.costo_unitario) || 0);
        const cantNeta = Number(ins.cantidad) || 0;
        const mermaPct = Number(ins.merma_pct) || 0;
        const cantBruta = mermaPct > 0 ? cantNeta / (1 - mermaPct / 100) : cantNeta;
        return s + cu * cantBruta;
      }, 0);

      const rendimiento = Number(prep.capacidad) || 0;
      const cantParaProducto = Number(prep.cantidad_por_unidad) || 0;
      const cantEnUnidadPrep = convertirUnidad(cantParaProducto, normU(prep.porcion_unidad || prep.unidad || ''), normU(prep.unidad || ''));

      if (rendimiento > 0 && cantEnUnidadPrep > 0) {
        const costoBase = (prepCost / rendimiento) * cantEnUnidadPrep;
        const mermaPrepPct = Number(prep.merma_pct) || 0;
        return sum + (mermaPrepPct > 0 ? costoBase * (1 + mermaPrepPct / 100) : costoBase);
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
