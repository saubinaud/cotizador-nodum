import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import PeriodoSelector from '../components/PeriodoSelector';
import {
  UtensilsCrossed, TrendingUp, TrendingDown, Percent,
  Receipt, ShoppingCart, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function currentMonthPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const fin = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { nombre: `${MESES[m]} ${y}`, fecha_inicio: inicio, fecha_fin: fin };
}

function fmt(n) {
  return formatCurrency(n);
}

function pct(n, total) {
  if (!total || total === 0) return '';
  return `${((n / total) * 100).toFixed(1)}%`;
}

export default function PLResumenPage() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();

  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);

  useEffect(() => {
    api.get('/pl/periodos').then((res) => {
      const pers = res.data || [];
      setPeriodos(pers);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadResumen = async (p) => {
    if (!p?.year || !p?.month) return;
    setLoadingData(true);
    try {
      const res = await api.get(`/pl/resumen?year=${p.year}&month=${p.month}`);
      setData(res.data || null);
    } catch {
      toast.error('Error cargando resumen P&L');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (periodo) loadResumen(periodo);
  }, [periodo]); // eslint-disable-line

  const crearPrimerPeriodo = async () => {
    setCreatingPeriodo(true);
    try {
      const mp = currentMonthPeriod();
      const res = await api.post('/pl/periodos', mp);
      const nuevo = res.data;
      setPeriodos((prev) => [...prev, nuevo]);
      toast.success('Periodo creado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingPeriodo(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-64'} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className={cx.skeleton + ' h-28'} />)}
        </div>
        <div className={cx.skeleton + ' h-96'} />
      </div>
    );
  }

  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-xl font-bold text-stone-900 mb-5">P&L — Estado de Resultados</h1>
        <div className={`${cx.card} p-12 text-center`}>
          <Receipt size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-sm mb-6">
            Para ver tu estado de resultados, primero necesitas crear un periodo contable.
          </p>
          <button onClick={crearPrimerPeriodo} disabled={creatingPeriodo} className={cx.btnPrimary}>
            {creatingPeriodo ? 'Creando...' : 'Crear primer periodo'}
          </button>
        </div>
      </div>
    );
  }

  const hasData = data && (data.kpis.num_ventas > 0 || data.gastos.total > 0);
  const ingresosNetos = data?.ingresos?.netos || 0;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-stone-900">P&L — Estado de Resultados</h1>
          <PeriodoSelector
            periodos={periodos}
            value={periodo}
            onChange={setPeriodo}
          />
        </div>
      </div>

      {loadingData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className={cx.skeleton + ' h-28'} />)}
          </div>
          <div className={cx.skeleton + ' h-96'} />
        </div>
      ) : !hasData ? (
        /* Empty state — actionable */
        <div className={`${cx.card} p-12 text-center`}>
          <Receipt size={48} className="text-stone-200 mx-auto mb-6" />
          <p className="text-stone-700 text-base font-semibold mb-2">Aun no hay datos en este periodo</p>
          <p className="text-stone-400 text-sm mb-8 max-w-sm mx-auto">
            Registra ventas, compras y gastos para generar tu estado de resultados automaticamente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => navigate('/pl/ventas')} className={cx.btnPrimary + ' flex items-center gap-2'}>
              <ShoppingCart size={14} /> Registrar ventas
            </button>
            <button onClick={() => navigate('/pl/compras')} className={cx.btnSecondary + ' flex items-center gap-2'}>
              <Receipt size={14} /> Registrar compras
            </button>
            <button onClick={() => navigate('/pl/gastos')} className={cx.btnSecondary + ' flex items-center gap-2'}>
              <Receipt size={14} /> Registrar gastos
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<UtensilsCrossed size={16} />}
              label="Food Cost"
              value={`${data.kpis.food_cost_pct}%`}
              color={data.kpis.food_cost_pct > 35 ? 'red' : data.kpis.food_cost_pct <= 30 ? 'green' : 'neutral'}
              sub="Insumos / Ingresos"
              trend={data.kpis.food_cost_pct <= 30 ? 'down' : data.kpis.food_cost_pct > 35 ? 'up' : null}
            />
            <KpiCard
              icon={<TrendingUp size={16} />}
              label="Margen Bruto"
              value={`${data.kpis.margen_bruto_pct}%`}
              color={data.kpis.margen_bruto_pct > 0 ? 'green' : data.kpis.margen_bruto_pct < 0 ? 'red' : 'neutral'}
              sub={fmt(data.utilidad_bruta)}
              trend={data.kpis.margen_bruto_pct > 0 ? 'up' : data.kpis.margen_bruto_pct < 0 ? 'down' : null}
            />
            <KpiCard
              icon={<Percent size={16} />}
              label="Margen Neto"
              value={`${data.kpis.margen_neto_pct}%`}
              color={data.kpis.margen_neto_pct > 0 ? 'green' : data.kpis.margen_neto_pct < 0 ? 'red' : 'neutral'}
              sub={fmt(data.utilidad_neta)}
              trend={data.kpis.margen_neto_pct > 0 ? 'up' : data.kpis.margen_neto_pct < 0 ? 'down' : null}
            />
            <KpiCard
              icon={<Receipt size={16} />}
              label="Ticket Promedio"
              value={fmt(data.kpis.ticket_promedio)}
              color="neutral"
              sub={`${data.kpis.num_ventas} ventas`}
            />
          </div>

          {/* P&L Statement — Accounting grade */}
          <div className={`${cx.card} overflow-hidden`}>
            {/* INGRESOS */}
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-100">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Ingresos</p>
            </div>
            <div className="px-6 py-3 space-y-2">
              <PLRow label="Ventas brutas" amount={data.ingresos.brutos} indent />
              <PLRow label="Descuentos" amount={-data.ingresos.descuentos} negative indent />
            </div>
            <div className="px-6 py-3 border-t border-stone-200 bg-stone-50/50">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-stone-700">Ingresos netos</span>
                <span className="text-stone-900 tabular-nums">{fmt(data.ingresos.netos)}</span>
              </div>
            </div>

            {/* COSTO DE VENTAS */}
            <div className="px-6 py-4 bg-stone-50 border-t border-b border-stone-100">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Costo de ventas</p>
            </div>
            <div className="px-6 py-3 space-y-2">
              <PLRow label="Insumos (food cost)" amount={data.cogs.insumos} indent note={pct(data.cogs.insumos, ingresosNetos)} />
              <PLRow label="Empaque" amount={data.cogs.empaque} indent />
            </div>
            <div className="px-6 py-3 border-t border-stone-200 bg-stone-50/50">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-stone-700">Total COGS</span>
                <span className="text-stone-900 tabular-nums">{fmt(data.cogs.total)}</span>
              </div>
            </div>

            {/* COGS real comparison */}
            {data.cogs_real && data.cogs_real.total > 0 && (
              <div className="px-6 py-3 border-t border-stone-100">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 italic pl-4">COGS real (compras)</span>
                  <span className="text-stone-500 tabular-nums">{fmt(data.cogs_real.total)}</span>
                </div>
                {data.cogs.total > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-stone-400 pl-4">Diferencia vs teorico</span>
                    <span className={`tabular-nums ${data.cogs_real.total > data.cogs.total ? 'text-rose-500' : 'text-teal-600'}`}>
                      {data.cogs_real.total > data.cogs.total ? '+' : ''}{fmt(data.cogs_real.total - data.cogs.total)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* UTILIDAD BRUTA — highlighted */}
            <div className="px-6 py-4 border-t-2 border-stone-300 bg-[var(--accent-light)]">
              <div className="flex justify-between items-center">
                <span className="font-bold text-stone-800">Utilidad bruta</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-stone-900 tabular-nums">{fmt(data.utilidad_bruta)}</span>
                  {ingresosNetos > 0 && (
                    <span className="text-xs text-stone-500 ml-2">({pct(data.utilidad_bruta, ingresosNetos)})</span>
                  )}
                </div>
              </div>
            </div>

            {/* GASTOS OPERATIVOS */}
            <div className="px-6 py-4 bg-stone-50 border-t border-b border-stone-100">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Gastos operativos</p>
            </div>
            <div className="px-6 py-3 space-y-2">
              <PLRow label="Gastos fijos" amount={data.gastos.fijos} indent />
              <PLRow label="Gastos variables" amount={data.gastos.variables} indent />
            </div>
            <div className="px-6 py-3 border-t border-stone-200 bg-stone-50/50">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-stone-700">Total gastos</span>
                <span className="text-stone-900 tabular-nums">{fmt(data.gastos.total)}</span>
              </div>
            </div>

            {/* DESMEDROS */}
            {data.desmedros?.total > 0 && (
              <>
                <div className="px-6 py-4 bg-stone-50 border-t border-b border-stone-100">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Desmedros</p>
                </div>
                <div className="px-6 py-3 space-y-2">
                  {data.desmedros.productos > 0 && (
                    <PLRow label="Producto terminado" amount={data.desmedros.productos} indent />
                  )}
                  {data.desmedros.preparaciones > 0 && (
                    <PLRow label="Preparaciones" amount={data.desmedros.preparaciones} indent />
                  )}
                  {data.desmedros.insumos > 0 && (
                    <PLRow label="Insumos" amount={data.desmedros.insumos} indent />
                  )}
                  {data.desmedros.materiales > 0 && (
                    <PLRow label="Materiales" amount={data.desmedros.materiales} indent />
                  )}
                </div>
                <div className="px-6 py-3 border-t border-stone-200 bg-stone-50/50">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-stone-700">Total desmedros</span>
                    <span className="text-rose-600 tabular-nums">{fmt(data.desmedros.total)}</span>
                  </div>
                </div>
              </>
            )}

            {/* UTILIDAD OPERATIVA */}
            <div className="px-6 py-4 border-t-2 border-stone-300">
              <div className="flex justify-between items-center">
                <span className="font-bold text-stone-800">Utilidad operativa</span>
                <div className="text-right">
                  <span className={`text-lg font-bold tabular-nums ${parseFloat(data.utilidad_operativa) >= 0 ? 'text-stone-900' : 'text-rose-600'}`}>
                    {fmt(data.utilidad_operativa)}
                  </span>
                  {ingresosNetos > 0 && (
                    <span className="text-xs text-stone-500 ml-2">({pct(data.utilidad_operativa, ingresosNetos)})</span>
                  )}
                </div>
              </div>
            </div>

            {/* IMPUESTOS */}
            {data.impuestos > 0 && (
              <>
                <div className="px-6 py-4 bg-stone-50 border-t border-b border-stone-100">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Impuestos</p>
                </div>
                <div className="px-6 py-3 space-y-2">
                  <PLRow label="IGV / Impuestos" amount={data.impuestos} indent />
                </div>
              </>
            )}

            {/* UTILIDAD NETA — BIG, prominent */}
            <div className="px-6 py-5 border-t-2 border-stone-400">
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold text-stone-900">Utilidad neta</span>
                <div className="text-right">
                  <span className={`text-2xl font-bold tabular-nums ${parseFloat(data.utilidad_neta) >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                    {fmt(data.utilidad_neta)}
                  </span>
                  {ingresosNetos > 0 && (
                    <p className="text-xs text-stone-400 mt-0.5">Margen: {pct(data.utilidad_neta, ingresosNetos)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Top Productos — mini-table pattern */}
          {data.top_productos && data.top_productos.length > 0 && (
            <div className={cx.card}>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-stone-900 mb-3">Top Productos</h3>

                {/* Desktop table — bordered, bg-stone-50 header */}
                <div className="hidden sm:block">
                  <div className="border border-stone-100 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-stone-50">
                          <th className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-left px-4 py-3 w-10">#</th>
                          <th className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-left px-4 py-3">Producto</th>
                          <th className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-right px-4 py-3">Unidades</th>
                          <th className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-right px-4 py-3">Ingresos</th>
                          <th className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-right px-4 py-3">Utilidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_productos.map((p, i) => {
                          const util = parseFloat(p.utilidad);
                          return (
                            <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                              <td className="px-4 py-3.5 text-sm text-stone-400 font-medium">{i + 1}</td>
                              <td className="px-4 py-3.5 text-sm font-medium text-stone-900">{p.nombre}</td>
                              <td className="px-4 py-3.5 text-sm text-right text-stone-600 tabular-nums">{parseInt(p.unidades)}</td>
                              <td className="px-4 py-3.5 text-sm text-right text-stone-600 tabular-nums">{fmt(p.ingresos)}</td>
                              <td className={'px-4 py-3.5 text-sm text-right font-semibold tabular-nums ' + (util >= 0 ? 'text-teal-700' : 'text-rose-600')}>
                                {fmt(util)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-stone-100">
                  {data.top_productos.map((p, i) => {
                    const util = parseFloat(p.utilidad);
                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-semibold text-stone-400 w-5 flex-shrink-0">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-900 truncate">{p.nombre}</p>
                            <p className="text-[11px] text-stone-400">{parseInt(p.unidades)} uds &middot; {fmt(p.ingresos)}</p>
                          </div>
                        </div>
                        <span className={'text-sm font-semibold flex-shrink-0 ml-3 tabular-nums ' + (util >= 0 ? 'text-teal-700' : 'text-rose-600')}>
                          {fmt(util)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Punto de Equilibrio */}
          {data.kpis.punto_equilibrio > 0 && (
            <div className={cx.card}>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={18} className="text-[var(--accent)]" />
                  <h3 className="text-lg font-semibold text-stone-900">Punto de Equilibrio</h3>
                </div>
                <p className="text-sm text-stone-600 mb-4">
                  Necesitas vender <span className="font-bold text-stone-900">{fmt(data.kpis.punto_equilibrio)}</span> para cubrir tus gastos fijos.
                </p>
                <BreakEvenBar current={ingresosNetos} target={data.kpis.punto_equilibrio} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────── */

function KpiCard({ icon, label, value, color, sub, trend }) {
  const colorMap = {
    green: 'text-teal-700',
    red: 'text-rose-600',
    neutral: 'text-stone-900',
  };
  const bgMap = {
    green: 'bg-teal-50',
    red: 'bg-rose-50',
    neutral: 'bg-stone-100',
  };
  const tintMap = {
    green: 'bg-teal-50/40',
    red: 'bg-rose-50/40',
    neutral: '',
  };
  return (
    <div className={`${cx.card} p-4 ${tintMap[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`p-1.5 rounded-lg ${bgMap[color]}`}>
          <span className={colorMap[color]}>{icon}</span>
        </span>
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <p className={`text-3xl font-bold ${colorMap[color]}`}>{value}</p>
        {trend === 'up' && <ArrowUpRight size={16} className="text-teal-600" />}
        {trend === 'down' && <ArrowDownRight size={16} className="text-rose-500" />}
      </div>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function PLRow({ label, amount, negative, indent, note }) {
  const val = parseFloat(amount) || 0;
  const isNeg = negative || val < 0;
  return (
    <div className="flex justify-between text-sm">
      <span className={`text-stone-600 ${indent ? 'pl-4' : ''}`}>{label}</span>
      <div className="flex items-center gap-2">
        {note && <span className="text-xs text-stone-400">{note}</span>}
        <span className={`font-medium tabular-nums ${isNeg ? 'text-rose-500' : 'text-stone-800'}`}>
          {isNeg && val !== 0 ? '-' : ''}{fmt(Math.abs(val))}
        </span>
      </div>
    </div>
  );
}

function BreakEvenBar({ current, target }) {
  const pctReached = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const reached = current >= target;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-stone-500 mb-2">
        <span>Ingresos actuales: {fmt(current)}</span>
        <span>Meta: {fmt(target)}</span>
      </div>
      <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${reached ? 'bg-teal-600' : 'bg-[var(--accent)]'}`}
          style={{ width: `${pctReached}%` }}
        />
      </div>
      {reached && (
        <p className="text-xs text-teal-700 font-semibold mt-2 flex items-center gap-1">
          <TrendingUp size={12} /> Punto de equilibrio alcanzado
        </p>
      )}
      {!reached && pctReached > 0 && (
        <p className="text-xs text-stone-500 mt-2">
          Falta {fmt(target - current)} ({(100 - pctReached).toFixed(1)}%)
        </p>
      )}
    </div>
  );
}
