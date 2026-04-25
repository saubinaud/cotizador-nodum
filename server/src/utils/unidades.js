/**
 * Sistema de unidades normalizado.
 * Cada tipo de medida tiene UNA unidad base:
 *   Peso   → gramo (g)
 *   Volumen → mililitro (ml)
 *   Conteo  → unidad (uni)
 */

const UNIDAD_BASE = {
  g: 'g', kg: 'g', oz: 'g', lb: 'g', mg: 'g',
  ml: 'ml', L: 'ml', l: 'ml',
  uni: 'uni', docena: 'uni',
  cm: 'cm', mt: 'cm', m: 'cm',
};

// Factor para convertir 1 unidad → unidad base
const A_BASE = {
  g: 1, kg: 1000, oz: 28.3495, lb: 453.592, mg: 0.001,
  ml: 1, L: 1000, l: 1000,
  uni: 1, docena: 12,
  cm: 1, mt: 100, m: 100,
};

function normU(u) {
  if (!u) return 'g';
  if (u === 'l') return 'L';
  return u;
}

/** Convierte cantidad a unidad base (g, ml, uni) */
function aBase(cantidad, unidad) {
  const u = normU(unidad);
  return cantidad * (A_BASE[u] || 1);
}

/** Convierte de unidad base a la unidad deseada */
function deBase(cantidad, unidad) {
  const u = normU(unidad);
  return cantidad / (A_BASE[u] || 1);
}

/** Obtiene la unidad base para una unidad dada */
function getUnidadBase(unidad) {
  const u = normU(unidad);
  return UNIDAD_BASE[u] || 'g';
}

/** Calcula el costo por unidad base a partir de la presentación */
function calcCostoBase(precio, cantidadPresentacion, unidadPresentacion) {
  const cantEnBase = aBase(cantidadPresentacion, unidadPresentacion);
  if (cantEnBase <= 0) return 0;
  return precio / cantEnBase;
}

/** Calcula el costo de una línea de insumo */
function calcCostoLinea(cantidad, usoUnidad, costoBase) {
  const cantEnBase = aBase(cantidad, usoUnidad);
  return cantEnBase * costoBase;
}

module.exports = {
  UNIDAD_BASE, A_BASE,
  normU, aBase, deBase, getUnidadBase,
  calcCostoBase, calcCostoLinea,
};
