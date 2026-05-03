// Common SUNAT error/warning codes for electronic billing
// Reference: https://cpe.sunat.gob.pe/informacion-tecnica
const SUNAT_CODES = {
  // Authentication / Profile errors
  '0100': 'Error de autenticación. Verifica tus credenciales SOL.',
  '0111': 'El usuario SOL no tiene perfil de emisión electrónica. Crea un usuario secundario en SUNAT con permiso de emisión.',
  '0150': 'Certificado digital no registrado en SUNAT.',

  // Document errors
  '2017': 'El RUC del receptor no existe o no está activo en SUNAT.',
  '2022': 'Este comprobante ya fue emitido anteriormente (serie-correlativo duplicado).',
  '2116': 'La fecha de emisión no puede ser mayor a la fecha actual.',
  '2119': 'La fecha de emisión no puede ser anterior a 7 días.',
  '2207': 'El tipo de documento del receptor no es válido.',
  '2800': 'La serie del comprobante no corresponde al tipo de documento.',

  // Amount / calculation errors
  '3105': 'El monto total no coincide con la suma de los ítems.',
  '3103': 'El valor unitario por ítem difiere del calculado.',

  // IGV errors
  '3462': 'La tasa de IGV no corresponde a una tasa vigente. Usa 18% (general) o 10.5% (restaurantes).',
  '3463': 'La tasa de IGV debe ser la misma en todas las líneas del documento.',

  // Warnings (3xxx that don't reject)
  '4000': 'Observación: el comprobante fue aceptado con advertencias.',

  // Connection errors
  'HTTP': 'Error de conexión con SUNAT. Intenta nuevamente en unos minutos.',
};

function getSunatMessage(code, defaultMsg) {
  if (!code) return defaultMsg || 'Error desconocido de SUNAT.';
  const mapped = SUNAT_CODES[String(code)];
  if (mapped) return mapped;
  // Warning codes (3xxx) are observations, not rejections
  if (String(code).startsWith('3') || String(code).startsWith('4')) {
    return defaultMsg || `Observación SUNAT (código ${code}). El comprobante fue aceptado.`;
  }
  return defaultMsg || `Error SUNAT (código ${code}).`;
}

module.exports = { SUNAT_CODES, getSunatMessage };
