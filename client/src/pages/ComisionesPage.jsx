import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import PeriodoSelector from '../components/PeriodoSelector';
import { Users, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';

export default function ComisionesPage() {
  const api = useApi();
  const toast = useToast();

  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [comisiones, setComisiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [details, setDetails] = useState({});

  useEffect(() => {
    api.get('/pl/periodos').then(res => {
      setPeriodos(res.data || []);
      const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
      setPeriodo({ year: now.getFullYear(), month: now.getMonth() + 1 });
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (periodo) loadComisiones(periodo);
  }, [periodo]); // eslint-disable-line

  async function loadComisiones(p) {
    setLoadingData(true);
    try {
      const qs = `year=${p.year}&month=${p.month}`;
      const res = await api.get(`/comisiones?${qs}`);
      setComisiones(res.data || []);
    } catch {
      toast.error('Error cargando comisiones');
    } finally {
      setLoadingData(false);
    }
  }

  async function toggleVendedor(vendedorId) {
    const isOpen = expanded[vendedorId];
    setExpanded(prev => ({ ...prev, [vendedorId]: !isOpen }));

    if (!isOpen && !details[vendedorId]) {
      try {
        const qs = `year=${periodo.year}&month=${periodo.month}`;
        const res = await api.get(`/comisiones/vendedor/${vendedorId}?${qs}`);
        setDetails(prev => ({ ...prev, [vendedorId]: res.data || [] }));
      } catch {
        toast.error('Error cargando detalle');
      }
    }
  }

  const totalComisiones = comisiones.reduce((s, c) => s + parseFloat(c.total_comision || 0), 0);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className={cx.skeleton + ' h-24'} />
        <div className={cx.skeleton + ' h-48'} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-stone-900">Comisiones</h1>
          <PeriodoSelector
            periodos={periodos}
            value={periodo}
            onChange={(p) => { setPeriodo(p); setExpanded({}); setDetails({}); }}
          />
        </div>
      </div>

      {/* Summary card */}
      <div className={`${cx.card} p-4 mb-5`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[var(--accent)]"><DollarSign size={18} /></span>
          <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">Total comisiones del mes</span>
        </div>
        <p className="text-2xl font-bold text-stone-900">{formatCurrency(totalComisiones)}</p>
        <p className="text-xs text-stone-400 mt-1">{comisiones.length} vendedor{comisiones.length !== 1 ? 'es' : ''}</p>
      </div>

      {/* Table by vendor */}
      {loadingData ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : comisiones.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Users size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 text-sm">No hay comisiones registradas en este periodo</p>
          <p className="text-stone-300 text-xs mt-1">Las comisiones se crean automaticamente al registrar ventas con un vendedor asignado</p>
        </div>
      ) : (
        <div className={`${cx.card} divide-y divide-stone-100`}>
          {/* Header */}
          <div className="hidden lg:grid grid-cols-6 gap-4 px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
            <div className="col-span-2">Vendedor</div>
            <div className="text-center">% Comision</div>
            <div className="text-center"># Ventas</div>
            <div className="text-right">Base</div>
            <div className="text-right">Comision</div>
          </div>

          {comisiones.map(c => {
            const isOpen = expanded[c.vendedor_id];
            const detail = details[c.vendedor_id] || [];

            return (
              <div key={c.vendedor_id}>
                {/* Vendor row */}
                <div
                  className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
                  onClick={() => toggleVendedor(c.vendedor_id)}
                >
                  <div className="col-span-2 flex items-center gap-2">
                    {isOpen ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
                    <div className="w-8 h-8 rounded-full bg-[#0A2F24] text-white flex items-center justify-center text-xs font-bold">
                      {c.vendedor_nombre?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm font-medium text-stone-900">{c.vendedor_nombre}</span>
                  </div>
                  <div className="hidden lg:flex items-center justify-center text-sm text-stone-600">
                    {parseFloat(c.comision_pct)}%
                  </div>
                  <div className="hidden lg:flex items-center justify-center text-sm text-stone-600">
                    {c.num_ventas}
                  </div>
                  <div className="hidden lg:flex items-center justify-end text-sm text-stone-600">
                    {formatCurrency(c.total_base)}
                  </div>
                  <div className="flex items-center justify-end text-sm font-semibold text-emerald-700">
                    {formatCurrency(c.total_comision)}
                  </div>
                </div>

                {/* Mobile summary row */}
                {!isOpen && (
                  <div className="flex lg:hidden gap-4 px-4 pb-3 text-xs text-stone-400">
                    <span>{parseFloat(c.comision_pct)}%</span>
                    <span>{c.num_ventas} venta{c.num_ventas != 1 ? 's' : ''}</span>
                    <span>Base: {formatCurrency(c.total_base)}</span>
                  </div>
                )}

                {/* Detail rows */}
                {isOpen && (
                  <div className="bg-stone-50 px-4 py-2 space-y-1">
                    {detail.length === 0 ? (
                      <p className="text-xs text-stone-400 py-2">Cargando...</p>
                    ) : (
                      <>
                        <div className="hidden lg:grid grid-cols-5 gap-4 text-[10px] font-semibold text-stone-400 uppercase tracking-wide pb-1">
                          <div>Fecha</div>
                          <div className="text-right">Venta</div>
                          <div className="text-right">Envio</div>
                          <div className="text-right">Base</div>
                          <div className="text-right">Comision</div>
                        </div>
                        {detail.map(d => (
                          <div key={d.id} className="grid grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-4 py-1.5 border-t border-stone-100 text-xs">
                            <div className="text-stone-500">{formatDate(d.fecha)}</div>
                            <div className="hidden lg:block text-right text-stone-600">{formatCurrency(d.monto_venta)}</div>
                            <div className="hidden lg:block text-right text-stone-400">
                              {parseFloat(d.costo_envio) > 0 ? formatCurrency(d.costo_envio) : '-'}
                            </div>
                            <div className="text-right text-stone-600">{formatCurrency(d.base_comision)}</div>
                            <div className="text-right font-medium text-emerald-700">{formatCurrency(d.comision_monto)}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
