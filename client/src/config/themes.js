export const THEMES = {
  coral: {
    name: 'Coral',
    accent: '#f97316',
    accentHover: '#ea580c',
    accentLight: '#fff7ed',
  },
  lavanda: {
    name: 'Lavanda',
    accent: '#8b5cf6',
    accentHover: '#7c3aed',
    accentLight: '#f5f3ff',
  },
  menta: {
    name: 'Menta',
    accent: '#14b8a6',
    accentHover: '#0d9488',
    accentLight: '#f0fdfa',
  },
};

export function getThemeKey() {
  if (typeof localStorage === 'undefined') return 'coral';
  return localStorage.getItem('nodum_theme') || 'coral';
}

export function setThemeKey(key) {
  localStorage.setItem('nodum_theme', key);
}
