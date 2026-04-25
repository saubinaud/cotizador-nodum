import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import {
  UtensilsCrossed, TrendingUp, TrendingDown, Percent,
  Receipt, ShoppingCart, Target, ArrowRight,
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
  return `(${((n / total) * 100).toFixed(1)}%)`;
}

export default function PLResumenPage() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();

  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);

  // Load periodos on mount
  useEffect(() => {
    api.get('/pl/periodos').then((res) => {
      const pers = res.data || [];
      setPeriodos(pers);
      if (pers.length > 0) setPeriodoId(pers[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Load P&L data when periodo changes
  const loadResumen = async (pid) => {
    if (!pid) return;
    setLoadingData(true);
    try {
      const res = await api.get(`/pl/resumen?periodo_id=${pid}`);
      setData(res.data || null);
    } catch {
      toast.error('Error cargando resumen P&L');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (periodoId) loadResumen(periodoId);
  }, [periodoId]); // eslint-disable-line

  const periodoOptions = useMemo(() =>
    periodos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [periodos]
  );

  const crearPrimerPeriodo = async () => {
    setCreatingPeriodo(true);
    try {
      const mp = currentMonthPeriod();
      const res = await api.post('/pl/periodos', mp);
      const nuevo = res.data;
      setPeriodos([nuevo]);
      setPeriodoId(nuevo.id);
      toast.success('Periodo creado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingPeriodo(false);
    }
  };

  // Loading skeleton
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

  // No periods
  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-2xl font-bold text-stone-900 mb-8">P&L — Estado de Resultados</h1>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-stone-900">P&L — Estado de Resultados</h1>
          <CustomSelect
            value={String(periodoId)}
            onChange={(v) => setPeriodoId(parseInt(v))}
            options={periodoOptions}
            placeholder="Periodo"
            className="w-48"
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
        /* Empty state */
        <div className={`${cx.card} p-12 text-center`}>
          <Receipt size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600 text-sm font-medium mb-2">Sin datos en este periodo</p>
          <p className="text-stone-400 text-xs mb-6">
            Registra ventas y gastos para ver tu estado de resultados.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => navigate('/pl/ventas')} className={cx.btnPrimary + ' flex items-center gap-2'}>
              <ShoppingCart size={14} /> Registrar ventas
            </button>
            <button onClick={() => navigate('/pl/gastos')} className={cx.btnSecondary + ' flex items-center gap-2'}>
              <Receipt size={14} /> Registrar gastos
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<UtensilsCrossed size={16} />}
              label="Food Cost"
              value={`${data.kpis.food_cost_pct}%`}
              color={data.kpis.food_cost_pct > 35 ? 'red' : data.kpis.food_cost_pct <= 30 ? 'green' : 'neutral'}
              sub="Insumos / Ingresos"
            />
            <KpiCard
              icon={<TrendingUp size={16} />}
              label="Margen Bruto"
              value={`${data.kpis.margen_bruto_pct}%`}
              color={data.kpis.margen_bruto_pct > 0 ? 'green' : data.kpis.margen_bruto_pct < 0 ? 'red' : 'neutral'}
              sub={fmt(data.utilidad_bruta)}
            />
            <KpiCard
              icon={<Percent size={16} />}
              label="Margen Neto"
              value={`${data.kpis.margen_neto_pct}%`}
              color={data.kpis.margen_neto_pct > 0 ? 'green' : data.kpis.margen_neto_pct < 0 ? 'red' : 'neutral'}
              sub={fmt(data.utilidad_neta)}
            />
            <KpiCard
              icon={<Receipt size={16} />}
              label="Ticket Promedio"
              value={fmt(data.kpis.ticket_promedio)}
              color="neutral"
              sub={`${data.kpis.num_ventas} ventas`}
            />
          </div>

          {/* P&L Statement */}
          <div className={cx.card}>
            <div className="p-6">
              {/* INGRESOS */}
              <SectionHeader label="Ingresos" />
              <LineItem label="Ventas brutas" amount={data.ingresos.brutos} />
              <LineItem label="Descuentos" amount={-data.ingresos.descuentos} negative />
              <div className="border-t border-stone-200 my-2" />
              <SubtotalLine label="Ingresos netos" amount={data.ingresos.netos} />

              <div className="h-6" />

              {/* COSTO DE VENTAS */}
              <SectionHeader label="Costo de ventas" />
              <LineItem label="Insumos (food cost)" amount={data.cogs.insumos} note={pct(data.cogs.insumos, ingresosNetos)} />
              <LineItem label="Empaque" amount={data.cogs.empaque} />
              <div className="border-t border-stone-200 my-2" />
              <SubtotalLine label="Total COGS" amount={data.cogs.total} />

              {/* UTILIDAD BRUTA */}
              <GrandTotal label="Utilidad Bruta" amount={data.utilidad_bruta} pctNote={pct(data.utilidad_bruta, ingresosNetos)} />

              {/* GASTOS OPERATIVOS */}
              <SectionHeader label="Gastos operativos" />
              <LineItem label="Gastos fijos" amount={data.gastos.fijos} />
              <LineItem label="Gastos variables" amount={data.gastos.variables} />
              <div className="border-t border-stone-200 my-2" />
              <SubtotalLine label="Total gastos" amount={data.gastos.total} />

              {/* UTILIDAD OPERATIVA */}
              <GrandTotal label="Utilidad Operativa" amount={data.utilidad_operativa} pctNote={pct(data.utilidad_operativa, ingresosNetos)} />

              {/* IMPUESTOS */}
              {data.impuestos > 0 && (
                <>
                  <SectionHeader label="Impuestos" />
                  <LineItem label="IGV / Impuestos" amount={data.impuestos} />
                </>
              )}

              {/* UTILIDAD NETA */}
              <GrandTotal label="Utilidad Neta" amount={data.utilidad_neta} pctNote={pct(data.utilidad_neta, ingresosNetos)} final />
            </div>
          </div>

          {/* Top Productos */}
          {data.top_productos && data.top_productos.length > 0 && (
            <div className={cx.card}>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-stone-900 mb-4">Top Productos</h3>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className={cx.th + ' w-10'}>#</th>
                        <th className={cx.th}>Producto</th>
                        <th className={cx.th + ' text-right'}>Unidades</th>
                        <th className={cx.th + ' text-right'}>Ingresos</th>
                        <th className={cx.th + ' text-right'}>Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_productos.map((p, i) => {
                        const util = parseFloat(p.utilidad);
                        return (
                          <tr key={p.id} className={cx.tr}>
                            <td className={cx.td + ' text-stone-400 font-medium'}>{i + 1}</td>
                            <td className={cx.td + ' font-medium text-stone-900'}>{p.nombre}</td>
                            <td className={cx.td + ' text-right text-stone-600'}>{parseInt(p.unidades)}</td>
                            <td className={cx.td + ' text-right text-stone-600'}>{fmt(p.ingresos)}</td>
                            <td className={cx.td + ' text-right font-semibold ' + (util >= 0 ? 'text-teal-700' : 'text-rose-600')}>
                              {fmt(util)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                        <span className={'text-sm font-semibold flex-shrink-0 ml-3 ' + (util >= 0 ? 'text-teal-700' : 'text-rose-600')}>
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
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
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

function KpiCard({ icon, label, value, color, sub }) {
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
  return (
    <div className={`${cx.card} p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`p-1.5 rounded-lg ${bgMap[color]}`}>
          <span className={colorMap[color]}>{icon}</span>
        </span>
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mt-6 mb-3 first:mt-0">
      {label}
    </p>
  );
}

function LineItem({ label, amount, negative, note }) {
  const val = parseFloat(amount) || 0;
  const isNeg = negative || val < 0;
  return (
    <div className="flex items-center justify-between py-1.5 px-1">
      <span className="text-sm text-stone-700">{label}</span>
      <div className="flex items-center gap-2">
        {note && <span className="text-xs text-stone-400">{note}</span>}
        <span className={`text-sm tabular-nums ${isNeg ? 'text-rose-600' : 'text-stone-800'}`}>
          {isNeg && val !== 0 ? '-' : ''}{fmt(Math.abs(val))}
        </span>
      </div>
    </div>
  );
}

function SubtotalLine({ label, amount }) {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      <span className="text-sm font-semibold text-stone-800">{label}</span>
      <span className="text-sm font-semibold text-stone-900 tabular-nums">{fmt(amount)}</span>
    </div>
  );
}

function GrandTotal({ label, amount, pctNote, final: isFinal }) {
  const val = parseFloat(amount) || 0;
  const isNeg = val < 0;
  return (
    <div className={`flex items-center justify-between py-3 px-1 my-3 ${isFinal ? 'border-t-2 border-b-2 border-stone-900' : 'border-t-2 border-stone-300'}`}>
      <span className={`${isFinal ? 'text-lg' : 'text-base'} font-bold text-stone-900`}>{label}</span>
      <div className="flex items-center gap-2">
        {pctNote && <span className="text-xs text-stone-400">{pctNote}</span>}
        <span className={`${isFinal ? 'text-lg' : 'text-base'} font-bold tabular-nums ${isNeg ? 'text-rose-600' : 'text-stone-900'}`}>
          {fmt(val)}
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
