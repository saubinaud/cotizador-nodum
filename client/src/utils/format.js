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

  if (modo === 'enteros') {
    // Always round up to next integer
    return Math.ceil(precio);
  }

  // 'decimales' and 'variable' use same logic: round to .90 or next integer
  const entero = Math.floor(precio);
  const centavos = precio - entero;
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
