import { cx } from '../styles/tokens';

export default function PLVentasPage() {
  return (
    <div className="max-w-7xl mx-auto pb-12">
      <h1 className="text-2xl font-bold text-stone-900 mb-8">P&L — Ventas</h1>
      <div className={`${cx.card} p-12 text-center`}>
        <p className="text-stone-400 text-sm">Proximamente: Registro y seguimiento de ventas por periodo</p>
      </div>
    </div>
  );
}
