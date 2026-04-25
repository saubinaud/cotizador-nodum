// Airbnb-inspired design tokens — clean, spacious, professional
export const cx = {
  // Buttons — Airbnb style: solid rounded, generous padding
  btnPrimary:
    'px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.97] disabled:opacity-50',
  btnSecondary:
    'px-5 py-2.5 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.97]',
  btnGhost:
    'px-3 py-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 text-sm font-medium rounded-lg transition-all duration-150',
  btnDanger:
    'px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-sm font-medium rounded-lg transition-all duration-150',
  btnIcon:
    'p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-all duration-150',

  // Inputs — Airbnb: white bg, clear border, rounded-lg
  input:
    'w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm placeholder:text-stone-400 focus:outline-none focus:border-stone-800 focus:ring-0 transition-all duration-150',
  select:
    'w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-stone-800 focus:ring-0 transition-all duration-150 appearance-none',

  // Labels
  label: 'block text-stone-600 text-xs font-semibold mb-1.5 tracking-wide',

  // Cards — Airbnb: clean border, subtle shadow on hover
  card: 'bg-white border border-stone-200 rounded-xl',
  cardHover:
    'bg-white border border-stone-200 rounded-xl hover:shadow-md hover:border-stone-300 transition-all duration-200 cursor-pointer',

  // Table
  th: 'px-4 py-3 text-left text-stone-500 text-[11px] font-semibold uppercase tracking-wide',
  td: 'px-4 py-3.5 text-sm',
  tr: 'border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors',

  // Badges — rounded-full, Airbnb pill style
  badge: (color) =>
    `inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${color}`,

  // Skeleton
  skeleton: 'bg-stone-100 rounded-xl animate-pulse',
};
