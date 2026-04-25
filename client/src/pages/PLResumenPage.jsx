import { cx } from '../styles/tokens';

export default function PLResumenPage() {
  return (
    <div className="max-w-7xl mx-auto pb-12">
      <h1 className="text-2xl font-bold text-stone-900 mb-8">P&L — Resumen</h1>
      <div className={`${cx.card} p-12 text-center`}>
        <p className="text-stone-400 text-sm">Proximamente: Dashboard financiero con estado de resultados</p>
      </div>
    </div>
  );
}
