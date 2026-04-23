export const cx = {
  btnPrimary:
    'px-4 py-2.5 bg-gradient-to-r from-[#FA7B21] to-[#FCA929] hover:from-[#E56D15] hover:to-[#FA7B21] text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-lg shadow-[#FA7B21]/20 active:scale-[0.98] disabled:opacity-50',
  btnSecondary:
    'px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-800 text-white text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.98]',
  btnGhost:
    'px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm rounded-xl transition-all duration-200',
  btnDanger:
    'px-3 py-2 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-sm rounded-xl transition-all duration-200',
  btnIcon:
    'p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all duration-200',
  input:
    'w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-800 rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#FA7B21] focus:ring-1 focus:ring-[#FA7B21]/30 transition-all duration-200',
  select:
    'w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-[#FA7B21] focus:ring-1 focus:ring-[#FA7B21]/30 transition-all duration-200 appearance-none',
  label: 'block text-zinc-400 text-xs font-medium mb-1.5 uppercase tracking-wider',
  card: 'bg-zinc-900 border border-zinc-800 rounded-2xl',
  cardHover:
    'bg-zinc-900 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-zinc-800 transition-all duration-200 cursor-pointer',
  th: 'px-4 py-3 text-left text-zinc-500 text-[10px] font-semibold uppercase tracking-widest',
  td: 'px-4 py-3.5 text-sm',
  tr: 'border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50 transition-colors',
  badge: (color) =>
    `inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${color}`,
  skeleton: 'bg-zinc-800 rounded-2xl animate-pulse',
};
