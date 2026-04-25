// Apple minimal + Airbnb clean + Seiko Presage depth
export const cx = {
  btnPrimary:
    'px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-lg transition-colors duration-150 active:scale-[0.97] disabled:opacity-40',
  btnSecondary:
    'px-4 py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 text-[13px] font-semibold rounded-lg transition-colors duration-150 active:scale-[0.97]',
  btnGhost:
    'px-3 py-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 text-[13px] font-medium rounded-lg transition-colors duration-150',
  btnDanger:
    'px-3 py-1.5 text-rose-600 hover:bg-rose-50 text-[13px] font-medium rounded-lg transition-colors duration-150',
  btnIcon:
    'p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors duration-150',
  input:
    'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-[13px] placeholder:text-stone-400 focus:outline-none focus:border-stone-500 transition-colors duration-150',
  select:
    'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-[13px] focus:outline-none focus:border-stone-500 transition-colors duration-150 appearance-none',
  label: 'block text-stone-500 text-[11px] font-semibold mb-1 tracking-wide',
  card: 'bg-white border border-stone-200 rounded-xl',
  cardHover:
    'bg-white border border-stone-200 rounded-xl hover:shadow-md transition-shadow duration-200 cursor-pointer',
  th: 'px-3 py-2.5 text-left text-stone-400 text-[10px] font-semibold uppercase tracking-wider',
  td: 'px-3 py-3 text-[13px]',
  tr: 'border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors',
  badge: (color) =>
    `inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`,
  skeleton: 'bg-stone-100 rounded-xl animate-pulse',
};
