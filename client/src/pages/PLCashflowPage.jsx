import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import {
  Wallet, ArrowUpRight, ArrowDownRight,
  Calculator, AlertTriangle, CheckCircle, DollarSign,
  ShoppingCart, Receipt, ShoppingBag,
} from 'lucide-react';

export default function PLCashflowPage() {
  const api = useApi();
  const toast = useToast();
  const { user } = useAuth();
  const simbolo = user?.simbolo || 'S/';

  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState('');
  const [data, setData] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);

  // Time view: 7, 15, 30
  const [diasView, setDiasView] = useState(7);
  // Chart mode: 'barras' or 'balance'
  const [chartMode, setChartMode] = useState('barras');

  // Simulador
  const [showSim, setShowSim] = useState(false);
  const [simMonto, setSimMonto] = useState('');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // Saldo inicial editing
  const [editingSaldo, setEditingSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState('');

  useEffect(() => {
    async function loadPeriodos() {
      try {
        const res = await api.get('/pl/periodos');
        const list = res.data || res || [];
        const arr = Array.isArray(list) ? list : [];
        setPeriodos(arr.map(p => ({ value: p.id, label: p.nombre })));
        if (arr.length > 0) setPeriodoId(arr[0].id);
      } catch {
        toast.error('Error cargando periodos');
      }
    }
    loadPeriodos();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!periodoId) return;
    loadData();
  }, [periodoId]); // eslint-disable-line

  async function loadData() {
    setLoading(true);
    try {
      const [cfRes, metRes] = await Promise.all([
        api.get(`/pl/cashflow?periodo_id=${periodoId}`),
        api.get(`/pl/cashflow/metricas?periodo_id=${periodoId}`),
      ]);
      setData(cfRes.data || cfRes);
      setMetricas(metRes.data || metRes);
    } catch {
      toast.error('Error cargando flujo de caja');
    } finally {
      setLoading(false);
    }
  }

  async function saveSaldoInicial() {
    try {
      await api.put(`/pl/periodos/${periodoId}/saldo-inicial`, { saldo_inicial: Number(saldoInput) || 0 });
      toast.success('Saldo inicial actualizado');
      setEditingSaldo(false);
      loadData();
    } catch {
      toast.error('Error guardando saldo');
    }
  }

  async function runSimulacion() {
    if (!simMonto) return;
    setSimLoading(true);
    try {
      const res = await api.get(`/pl/cashflow/simulacion?periodo_id=${periodoId}&monto=${simMonto}`);
      setSimResult(res.data || res);
    } catch {
      toast.error('Error en simulacion');
    } finally {
      setSimLoading(false);
    }
  }

  function renderChart() {
    if (!data?.diario) return null;

    const hoy = new Date();
    const allDays = data.diario;
    const endIdx = allDays.findIndex(d => new Date(d.fecha) > hoy);
    const relevantEnd = endIdx === -1 ? allDays.length : endIdx;
    const startIdx = Math.max(0, relevantEnd - diasView);
    const days = allDays.slice(startIdx, Math.min(startIdx + diasView, allDays.length));

    if (days.length === 0) return <div className="py-8 text-center text-sm text-stone-400">Sin datos para este rango</div>;

    if (chartMode === 'barras') {
      const maxVal = Math.max(...days.map(d => Math.max(d.entradas, d.salidas)), 1);

      return (
        <div className="flex items-end gap-1" style={{ height: '200px' }}>
          {days.map((d, i) => {
            const fecha = new Date(d.fecha);
            const isToday = fecha.toDateString() === hoy.toDateString();
            const dayLabel = fecha.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 3);
            const dateLabel = fecha.getDate();
            const hEntrada = (d.entradas / maxVal) * 100;
            const hSalida = (d.salidas / maxVal) * 100;

            return (
              <div key={i} className={`flex-1 flex flex-col items-center gap-0.5 ${isToday ? 'bg-stone-50 rounded-lg' : ''}`} title={`${formatDate(d.fecha)}\nEntradas: ${formatCurrency(d.entradas)}\nSalidas: ${formatCurrency(d.salidas)}\nSaldo: ${formatCurrency(d.balance)}`}>
                <div className="flex-1 w-full flex items-end justify-center gap-0.5 px-0.5">
                  <div className="flex-1 rounded-t" style={{ height: `${hEntrada}%`, backgroundColor: '#10b981', minHeight: d.entradas > 0 ? '2px' : '0' }} />
                  <div className="flex-1 rounded-t" style={{ height: `${hSalida}%`, backgroundColor: '#a8a29e', minHeight: d.salidas > 0 ? '2px' : '0' }} />
                </div>
                <span className={`text-[9px] ${isToday ? 'font-bold text-stone-800' : 'text-stone-400'}`}>{dateLabel}</span>
                <span className={`text-[8px] ${isToday ? 'font-bold text-stone-600' : 'text-stone-300'}`}>{dayLabel}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Balance line chart (CSS)
    const balances = days.map(d => d.balance);
    const minBal = Math.min(...balances);
    const maxBal = Math.max(...balances);
    const range = maxBal - minBal || 1;

    return (
      <div>
        <div className="flex items-end gap-px" style={{ height: '200px' }}>
          {days.map((d, i) => {
            const fecha = new Date(d.fecha);
            const isToday = fecha.toDateString() === hoy.toDateString();
            const pct = ((d.balance - minBal) / range) * 100;

            return (
              <div key={i} className="flex-1 flex flex-col items-center" title={`${formatDate(d.fecha)}: ${formatCurrency(d.balance)}`}>
                <div className="flex-1 w-full flex items-end justify-center">
                  <div className={`w-full max-w-[6px] rounded-t ${d.balance >= 0 ? 'bg-stone-700' : 'bg-rose-400'}`}
                    style={{ height: `${Math.max(pct, 2)}%` }} />
                </div>
                {isToday && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-0.5" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-stone-400">{formatDate(days[0]?.fecha)}</span>
          <span className="text-[9px] text-stone-400">{formatDate(days[days.length - 1]?.fecha)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Mi Plata</h1>
          <p className="text-sm text-stone-500 mt-0.5">Flujo de caja de tu negocio</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-52">
            <CustomSelect options={periodos} value={periodoId} onChange={setPeriodoId} placeholder="Periodo..." />
          </div>
          <button onClick={() => setShowSim(!showSim)} className={cx.btnSecondary + ' flex items-center gap-2'}>
            <Calculator size={14} /> Me alcanza?
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
      ) : data && (
        <>
          {/* Hero card: saldo actual */}
          <div className={`${cx.card} p-6 mb-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-1">Saldo disponible</p>
                <p className={`text-3xl font-bold ${data.saldo_actual >= 0 ? 'text-stone-900' : 'text-rose-600'}`}>
                  {simbolo} {Number(data.saldo_actual).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </p>
                {metricas?.comparacion && (
                  <div className="flex items-center gap-1 mt-1">
                    {metricas.comparacion.variacion_pct >= 0
                      ? <ArrowUpRight size={14} className="text-emerald-500" />
                      : <ArrowDownRight size={14} className="text-rose-500" />
                    }
                    <span className={`text-xs font-semibold ${metricas.comparacion.variacion_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {metricas.comparacion.variacion_pct > 0 ? '+' : ''}{metricas.comparacion.variacion_pct}% vs periodo anterior
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {metricas && (
                  <span className={`w-3 h-3 rounded-full ${
                    metricas.health === 'sano' ? 'bg-emerald-500' : metricas.health === 'atencion' ? 'bg-amber-500' : 'bg-rose-500'
                  }`} title={metricas.health} />
                )}
                <Wallet size={28} className="text-stone-300" />
              </div>
            </div>
          </div>

          {/* 3 metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className={`${cx.card} p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight size={14} className="text-emerald-500" />
                <span className="text-xs text-stone-500 font-medium">Entradas</span>
              </div>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(data.total_entradas)}</p>
            </div>
            <div className={`${cx.card} p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight size={14} className="text-stone-400" />
                <span className="text-xs text-stone-500 font-medium">Salidas</span>
              </div>
              <p className="text-lg font-bold text-stone-600">{formatCurrency(data.total_salidas)}</p>
            </div>
            <div className={`${cx.card} p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="text-stone-400" />
                <span className="text-xs text-stone-500 font-medium">Saldo inicial</span>
              </div>
              {editingSaldo ? (
                <div className="flex items-center gap-2">
                  <input type="number" step="0.01" value={saldoInput} onChange={e => setSaldoInput(e.target.value)} className={cx.input + ' max-w-[8rem] text-sm'} autoFocus />
                  <button onClick={saveSaldoInicial} className={cx.btnPrimary + ' text-xs px-3 py-1.5'}>OK</button>
                  <button onClick={() => setEditingSaldo(false)} className={cx.btnGhost + ' text-xs'}>X</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-stone-600">{formatCurrency(data.saldo_inicial)}</p>
                  <button onClick={() => { setSaldoInput(data.saldo_inicial || 0); setEditingSaldo(true); }} className={cx.btnGhost + ' text-xs'}>Editar</button>
                </div>
              )}
            </div>
          </div>

          {/* Chart area */}
          <div className={`${cx.card} p-5 mb-4`}>
            <div className="flex items-center justify-between mb-4">
              {/* Chart mode toggle */}
              <div className="flex gap-1 p-1 bg-stone-100 rounded-lg">
                <button onClick={() => setChartMode('barras')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${chartMode === 'barras' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>
                  Entradas / Salidas
                </button>
                <button onClick={() => setChartMode('balance')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${chartMode === 'balance' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>
                  Saldo
                </button>
              </div>
              {/* Time range pills */}
              <div className="flex gap-1">
                {[7, 15, 30].map(d => (
                  <button key={d} onClick={() => setDiasView(d)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md ${diasView === d ? 'bg-stone-800 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* CSS bar chart */}
            {renderChart()}

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-stone-400">
              {chartMode === 'barras' ? (
                <>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Entradas</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-stone-400" /> Salidas</span>
                </>
              ) : (
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-stone-700" /> Saldo</span>
              )}
            </div>
          </div>

          {/* Quick metrics row */}
          {metricas && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className={`${cx.card} p-4`}>
                <span className="text-xs text-stone-500 font-medium">Venta promedio/dia</span>
                <p className="text-sm font-bold text-stone-800 mt-1">{formatCurrency(metricas.promedio_venta_diaria)}</p>
              </div>
              <div className={`${cx.card} p-4`}>
                <span className="text-xs text-stone-500 font-medium">Gasto promedio/dia</span>
                <p className="text-sm font-bold text-stone-800 mt-1">{formatCurrency(metricas.promedio_gasto_diario)}</p>
              </div>
              <div className={`${cx.card} p-4`}>
                <span className="text-xs text-stone-500 font-medium">Ratio caja</span>
                <p className={`text-sm font-bold mt-1 ${metricas.ratio_caja >= 1.2 ? 'text-emerald-600' : metricas.ratio_caja >= 0.8 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metricas.ratio_caja}x
                </p>
              </div>
              <div className={`${cx.card} p-4`}>
                <span className="text-xs text-stone-500 font-medium">Te alcanza para</span>
                <p className={`text-sm font-bold mt-1 ${
                  metricas.runway_dias === null ? 'text-emerald-600' : metricas.runway_dias > 15 ? 'text-emerald-600' : metricas.runway_dias > 7 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {metricas.runway_dias === null ? '\u221E' : `~${metricas.runway_dias} dias`}
                </p>
              </div>
            </div>
          )}

          {/* Simulador "Me alcanza?" */}
          {showSim && (
            <div className={`${cx.card} p-5 mb-4 border-[var(--accent)]`}>
              <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
                <Calculator size={16} className="text-[var(--accent)]" /> Me alcanza para esta compra?
              </h3>
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className={cx.label}>Monto de la compra ({simbolo})</label>
                  <input type="number" step="0.01" min="0" value={simMonto} onChange={e => setSimMonto(e.target.value)}
                    className={cx.input} placeholder="Ej: 2500" />
                </div>
                <button onClick={runSimulacion} disabled={simLoading || !simMonto} className={cx.btnPrimary + ' h-[42px]'}>
                  {simLoading ? 'Calculando...' : 'Simular'}
                </button>
              </div>

              {simResult && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="text-xs text-stone-500">Tu saldo hoy</span>
                      <p className="text-sm font-bold text-stone-800">{formatCurrency(simResult.balance_hoy)}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${simResult.balance_despues >= 0 ? 'bg-stone-50' : 'bg-rose-50'}`}>
                      <span className="text-xs text-stone-500">Despues de la compra</span>
                      <p className={`text-sm font-bold ${simResult.balance_despues >= 0 ? 'text-stone-800' : 'text-rose-600'}`}>
                        {formatCurrency(simResult.balance_despues)}
                      </p>
                    </div>
                  </div>

                  {simResult.gastos_fijos_pendientes?.length > 0 && (
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <span className="text-xs text-amber-700 font-medium">Gastos fijos pendientes este mes:</span>
                      <div className="mt-1 space-y-1">
                        {simResult.gastos_fijos_pendientes.map((g, i) => (
                          <div key={i} className="flex justify-between text-xs text-amber-600">
                            <span>{g.nombre}</span>
                            <span>-{formatCurrency(g.monto_default)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-bold text-amber-700 border-t border-amber-200 pt-1 mt-1">
                          <span>Total pendiente</span>
                          <span>-{formatCurrency(simResult.total_fijos_pendientes)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`p-3 rounded-lg flex items-center gap-3 ${
                    simResult.veredicto === 'ok' ? 'bg-emerald-50' :
                    simResult.veredicto === 'ajustado' ? 'bg-amber-50' : 'bg-rose-50'
                  }`}>
                    {simResult.veredicto === 'ok' ? <CheckCircle size={20} className="text-emerald-600 shrink-0" /> :
                     simResult.veredicto === 'ajustado' ? <AlertTriangle size={20} className="text-amber-600 shrink-0" /> :
                     <AlertTriangle size={20} className="text-rose-600 shrink-0" />
                    }
                    <div>
                      <p className={`text-sm font-semibold ${
                        simResult.veredicto === 'ok' ? 'text-emerald-700' :
                        simResult.veredicto === 'ajustado' ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {simResult.veredicto === 'ok' ? 'Si, puedes permitirtelo' :
                         simResult.veredicto === 'ajustado' ? 'Ajustado -- revisa tus gastos fijos' :
                         simResult.veredicto === 'riesgo' ? 'Riesgo -- no cubririas gastos fijos pendientes' :
                         'No alcanza -- tu saldo quedaria negativo'}
                      </p>
                      {simResult.dias_para_recuperar && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          Recuperarias el monto en ~{simResult.dias_para_recuperar} dias de venta
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Movimientos recientes */}
          <div className={`${cx.card} overflow-hidden`}>
            <div className="p-4 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Movimientos recientes</h3>
            </div>
            <div className="divide-y divide-stone-100">
              {(data.movimientos || []).map(mov => (
                <div key={mov.id} className="flex items-center justify-between px-4 py-3 hover:bg-stone-50/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      mov.tipo === 'venta' ? 'bg-emerald-50' : 'bg-stone-100'
                    }`}>
                      {mov.tipo === 'venta' ? <ShoppingCart size={14} className="text-emerald-500" /> :
                       mov.tipo === 'compra' ? <ShoppingBag size={14} className="text-stone-400" /> :
                       <Receipt size={14} className="text-stone-400" />}
                    </div>
                    <div>
                      <p className="text-sm text-stone-800">{mov.producto_nombre || mov.categoria_nombre || mov.descripcion || mov.tipo}</p>
                      <p className="text-xs text-stone-400">{formatDate(mov.fecha)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${parseFloat(mov.monto) >= 0 ? 'text-emerald-600' : 'text-stone-600'}`}>
                    {parseFloat(mov.monto) >= 0 ? '+' : ''}{formatCurrency(Math.abs(parseFloat(mov.monto)))}
                  </span>
                </div>
              ))}
              {(!data.movimientos || data.movimientos.length === 0) && (
                <div className="py-8 text-center text-sm text-stone-400">No hay movimientos en este periodo</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
