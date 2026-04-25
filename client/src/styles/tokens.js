export const cx = {
  btnPrimary:
    'px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-lg shadow-[var(--accent)]/20 active:scale-[0.98] disabled:opacity-50',
  btnSecondary:
    'px-4 py-2.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.98]',
  btnGhost:
    'px-3 py-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 text-sm rounded-xl transition-all duration-200',
  btnDanger:
    'px-3 py-2 text-rose-400 hover:text-rose-500 hover:bg-rose-50 text-sm rounded-xl transition-all duration-200',
  btnIcon:
    'p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-all duration-200',
  input:
    'w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm placeholder:text-stone-400 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all duration-200',
  select:
    'w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all duration-200 appearance-none',
  label: 'block text-stone-500 text-xs font-medium mb-1.5 uppercase tracking-wider',
  card: 'bg-white border border-stone-200 rounded-2xl shadow-sm',
  cardHover:
    'bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:border-stone-300 transition-all duration-200 cursor-pointer',
  th: 'px-4 py-3 text-left text-stone-400 text-[10px] font-semibold uppercase tracking-widest',
  td: 'px-4 py-3.5 text-sm',
  tr: 'border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors',
  badge: (color) =>
    `inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${color}`,
  skeleton: 'bg-stone-100 rounded-2xl animate-pulse',
};
