export const cx = {
  // Buttons — pill shape for primary (Uber style), rounded for secondary
  btnPrimary:
    'px-5 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-full transition-all duration-200 shadow-md shadow-[var(--accent)]/15 active:scale-[0.97] disabled:opacity-50',
  btnSecondary:
    'px-5 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold rounded-full transition-all duration-200 active:scale-[0.97]',
  btnGhost:
    'px-3 py-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 text-sm font-medium rounded-xl transition-all duration-200',
  btnDanger:
    'px-3 py-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-xl transition-all duration-200',
  btnIcon:
    'p-2.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-all duration-200',

  // Inputs — taller, cleaner (Uber 56px style)
  input:
    'w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-800 text-sm placeholder:text-stone-400 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-all duration-200',
  select:
    'w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-all duration-200 appearance-none',

  // Labels — clear hierarchy
  label: 'block text-stone-500 text-xs font-semibold mb-2 uppercase tracking-wider',

  // Cards — subtle shadow (Rappi style)
  card: 'bg-white border border-stone-100 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]',
  cardHover:
    'bg-white border border-stone-100 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:border-stone-200 transition-all duration-200 cursor-pointer',

  // Table
  th: 'px-4 py-3.5 text-left text-stone-400 text-[10px] font-bold uppercase tracking-widest',
  td: 'px-4 py-4 text-sm',
  tr: 'border-b border-stone-100 last:border-0 hover:bg-stone-50/60 transition-colors',

  // Badges
  badge: (color) =>
    `inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${color}`,

  // Skeleton
  skeleton: 'bg-stone-100 rounded-2xl animate-pulse',
};
