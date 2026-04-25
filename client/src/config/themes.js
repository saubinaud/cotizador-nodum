export const THEMES = {
  menta: {
    name: 'Menta',
    accent: '#059669',
    accentHover: '#047857',
    accentLight: '#ecfdf5',
  },
  coral: {
    name: 'Coral',
    accent: '#e8590c',
    accentHover: '#c2410c',
    accentLight: '#fff7ed',
  },
  lavanda: {
    name: 'Lavanda',
    accent: '#4f46e5',
    accentHover: '#4338ca',
    accentLight: '#eef2ff',
  },
};

export function getThemeKey() {
  if (typeof localStorage === 'undefined') return 'menta';
  return localStorage.getItem('nodum_theme') || 'menta';
}

export function setThemeKey(key) {
  localStorage.setItem('nodum_theme', key);
}
