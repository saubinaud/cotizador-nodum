export function formatCurrency(n) {
  if (n == null || isNaN(n)) return 'S/ 0.00';
  return `S/ ${Number(n).toFixed(2)}`;
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${Number(n).toFixed(1)}%`;
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
