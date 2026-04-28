// Apple + Airbnb + Seiko Presage — premium, spacious, clean
export const cx = {
  btnPrimary:
    'px-5 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] disabled:opacity-40 shadow-sm hover:shadow',
  btnSecondary:
    'px-5 py-2.5 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 text-sm font-semibold rounded-lg transition-colors duration-150 active:scale-[0.97]',
  btnGhost:
    'px-3 py-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 text-sm font-medium rounded-lg transition-colors duration-150',
  btnDanger:
    'px-3 py-2 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg transition-colors duration-150',
  btnIcon:
    'p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors duration-150',
  input:
    'w-full px-4 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm placeholder:text-stone-400 focus:outline-none focus:border-stone-500 transition-colors duration-150',
  select:
    'w-full px-4 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:border-stone-500 transition-colors duration-150 appearance-none',
  label: 'block text-stone-500 text-xs font-semibold mb-1.5 tracking-wide',
  card: 'bg-white border border-stone-200 rounded-xl',
  cardHover:
    'bg-white border border-stone-200 rounded-xl hover:shadow-md transition-shadow duration-200 cursor-pointer',
  th: 'px-4 py-3 text-left text-stone-400 text-[11px] font-semibold uppercase tracking-wider',
  td: 'px-4 py-3.5 text-sm',
  tr: 'border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors',
  badge: (color) =>
    `inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold ${color}`,
  skeleton: 'bg-stone-100 rounded-xl animate-pulse',
};
