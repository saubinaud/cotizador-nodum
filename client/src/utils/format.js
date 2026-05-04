export function formatCurrency(n, decimals) {
  const simbolo = (typeof localStorage !== 'undefined' && localStorage.getItem('nodum_moneda_simbolo')) || 'S/';
  if (n == null || isNaN(n)) return `${simbolo} 0.00`;
  const val = Number(n);
  const d = decimals != null ? decimals : (Math.abs(val) < 1 && val !== 0 ? 3 : 2);
  return `${simbolo} ${val.toFixed(d)}`;
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  // DB stores decimal (0.5 = 50%), display as integer %
  const val = Number(n);
  const pct = val < 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

export function precioComercial(precio, modo = 'variable') {
  if (!precio || precio <= 0) return 0;

  // Round to 2 decimals first to avoid floating point noise (16.0099999 → 16.01)
  const p = Math.round(precio * 100) / 100;

  if (modo === 'enteros') {
    // Round to nearest integer (not always up)
    return Math.round(p);
  }

  // 'decimales' and 'variable': round to .90 or nearest integer
  const entero = Math.floor(p);
  const centavos = Math.round((p - entero) * 100) / 100;
  if (centavos <= 0.05) return entero || 1;
  if (centavos <= 0.90) return entero + 0.90;
  return entero + 1;
}

// Helper to get both versions
export function preciosRecomendados(precio) {
  return {
    conDecimales: precioComercial(precio, 'decimales'),
    sinDecimales: precioComercial(precio, 'enteros'),
  };
}

export function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
