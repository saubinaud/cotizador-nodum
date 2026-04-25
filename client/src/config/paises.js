export const PAISES = [
  { code: 'PE', name: 'Peru', moneda: 'PEN', simbolo: 'S/' },
  { code: 'MX', name: 'Mexico', moneda: 'MXN', simbolo: '$' },
  { code: 'CO', name: 'Colombia', moneda: 'COP', simbolo: '$' },
  { code: 'CL', name: 'Chile', moneda: 'CLP', simbolo: '$' },
  { code: 'AR', name: 'Argentina', moneda: 'ARS', simbolo: '$' },
  { code: 'EC', name: 'Ecuador', moneda: 'USD', simbolo: '$' },
  { code: 'BO', name: 'Bolivia', moneda: 'BOB', simbolo: 'Bs' },
  { code: 'PY', name: 'Paraguay', moneda: 'PYG', simbolo: '\u20B2' },
  { code: 'UY', name: 'Uruguay', moneda: 'UYU', simbolo: '$U' },
  { code: 'VE', name: 'Venezuela', moneda: 'VES', simbolo: 'Bs.D' },
  { code: 'CR', name: 'Costa Rica', moneda: 'CRC', simbolo: '\u20A1' },
  { code: 'PA', name: 'Panama', moneda: 'USD', simbolo: '$' },
  { code: 'GT', name: 'Guatemala', moneda: 'GTQ', simbolo: 'Q' },
  { code: 'HN', name: 'Honduras', moneda: 'HNL', simbolo: 'L' },
  { code: 'SV', name: 'El Salvador', moneda: 'USD', simbolo: '$' },
  { code: 'NI', name: 'Nicaragua', moneda: 'NIO', simbolo: 'C$' },
  { code: 'DO', name: 'Rep. Dominicana', moneda: 'DOP', simbolo: 'RD$' },
  { code: 'BR', name: 'Brasil', moneda: 'BRL', simbolo: 'R$' },
];

export function getSimbolo(moneda) {
  const pais = PAISES.find(p => p.moneda === moneda);
  return pais ? pais.simbolo : 'S/';
}

export function getPaisByCode(code) {
  return PAISES.find(p => p.code === code);
}
