export function formatCurrency(n) {
  const simbolo = (typeof localStorage !== 'undefined' && localStorage.getItem('nodum_moneda_simbolo')) || 'S/';
  if (n == null || isNaN(n)) return `${simbolo} 0.00`;
  return `${simbolo} ${Number(n).toFixed(2)}`;
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  // DB stores decimal (0.5 = 50%), display as integer %
  const val = Number(n);
  const pct = val < 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

export function precioComercial(precio) {
  if (!precio || precio <= 0) return 0;
  const entero = Math.floor(precio);
  const centavos = precio - entero;
  if (centavos <= 0.05) return entero || 0.90;
  if (centavos <= 0.90) return entero + 0.90;
  return entero + 1;
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
