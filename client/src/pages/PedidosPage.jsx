import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  X, ClipboardList, DollarSign, Truck, PackageCheck,
  Clock, CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function estadoBadge(estado) {
  const colors = {
    pendiente: 'bg-amber-50 text-amber-600',
    en_produccion: 'bg-sky-50 text-sky-600',
    listo: 'bg-violet-50 text-violet-600',
    entregado: 'bg-orange-50 text-orange-600',
    pagado: 'bg-emerald-50 text-emerald-600',
    cancelado: 'bg-stone-100 text-stone-400',
  };
  return cx.badge(colors[estado] || 'bg-stone-100 text-stone-500');
}

const ESTADO_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_produccion', label: 'En produccion' },
  { value: 'listo', label: 'Listo' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const ESTADO_UPDATE_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_produccion', label: 'En produccion' },
  { value: 'listo', label: 'Listo' },
];

const METODO_PAGO_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

export default function PedidosPage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [pedidos, setPedidos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');

  // Payment modal
  const [showPago, setShowPago] = useState(null);
  const [pagoForm, setPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', cuenta_id: '', notas: '' });
  const [savingPago, setSavingPago] = useState(false);

  // Detail modal
  const [detalle, setDetalle] = useState(null);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState(null);

  // Mobile accordion
  const [expanded, setExpanded] = useState({});

  // Catalogs
  const [clientes, setClientes] = useState([]);
  const [cuentas, setCuentas] = useState([]);

  // Load data
  const loadPedidos = async () => {
    try {
      const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
      const [pedidosRes, resumenRes] = await Promise.all([
        api.get(`/pedidos${qs}`),
        api.get('/pedidos/pendientes'),
      ]);
      setPedidos((pedidosRes.data || pedidosRes) || []);
      const resData = resumenRes.data || resumenRes;
      setResumen(resData.resumen || resData || null);
    } catch {
      toast.error('Error cargando pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get('/clientes').catch(() => []),
      api.get('/flujo/cuentas').catch(() => []),
    ]).then(([clientesRes, cuentasRes]) => {
      const cList = (clientesRes.data || clientesRes || []);
      setClientes(cList.map(c => ({ value: String(c.id), label: c.razon_social || c.nombre || `${c.num_doc}` })));
      const aList = (cuentasRes.data || cuentasRes || []);
      setCuentas(aList.map(c => ({ value: String(c.id), label: c.nombre })));
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    loadPedidos();
  }, [filtroEstado]); // eslint-disable-line

  // Update estado
  const handleUpdateEstado = async (id, estado) => {
    try {
      await api.put(`/pedidos/${id}`, { estado });
      toast.success('Estado actualizado');
      loadPedidos();
    } catch (err) {
      toast.error(err.message || 'Error actualizando');
    }
  };

  // Entregar
  const handleEntregar = async (id) => {
    try {
      await api.post(`/pedidos/${id}/entregar`);
      toast.success('Pedido marcado como entregado');
      loadPedidos();
    } catch (err) {
      toast.error(err.message || 'Error al entregar');
    }
  };

  // Cancel
  const handleCancelar = async () => {
    if (!cancelTarget) return;
    try {
      await api.del(`/pedidos/${cancelTarget.id}`);
      toast.success('Pedido cancelado');
      loadPedidos();
    } catch (err) {
      toast.error(err.message || 'Error cancelando');
    } finally {
      setCancelTarget(null);
    }
  };

  // Open payment modal
  const openPagoModal = (pedido) => {
    setShowPago(pedido);
    setPagoForm({
      monto: String(parseFloat(pedido.monto_pendiente) || ''),
      metodo_pago: 'efectivo',
      cuenta_id: '',
      notas: '',
    });
  };

  // Register payment
  const handleRegistrarPago = async () => {
    if (!showPago || !pagoForm.monto) {
      toast.error('Monto es requerido');
      return;
    }
    setSavingPago(true);
    try {
      await api.post(`/pedidos/${showPago.id}/pagos`, {
        monto: parseFloat(pagoForm.monto),
        metodo_pago: pagoForm.metodo_pago,
        cuenta_id: pagoForm.cuenta_id || null,
        notas: pagoForm.notas || null,
      });
      toast.success('Pago registrado');
      setShowPago(null);
      loadPedidos();
    } catch (err) {
      toast.error(err.message || 'Error registrando pago');
    } finally {
      setSavingPago(false);
    }
  };

  // Load detail
  const loadDetalle = async (id) => {
    try {
      const res = await api.get(`/pedidos/${id}`);
      setDetalle(res.data || res);
    } catch (err) {
      toast.error(err.message || 'Error cargando detalle');
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Contra Entrega</h1>
          <p className="text-sm text-stone-500 mt-0.5">Pedidos pendientes de cobro</p>
        </div>
        {/* Estado tabs */}
        <div className="flex gap-1 flex-wrap">
          {[
            { value: '', label: 'Todos' },
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'en_produccion', label: 'En produccion' },
            { value: 'listo', label: 'Listo' },
            { value: 'entregado', label: 'Entregado' },
            { value: 'pagado', label: 'Pagado' },
          ].map(t => (
            <button key={t.value} onClick={() => setFiltroEstado(t.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filtroEstado === t.value ? 'bg-[#0A2F24] text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className={cx.card + ' p-4'}>
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign size={16} className="text-amber-500" />
              <span className="text-xs text-stone-500">Pendiente de cobro</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(resumen.total_pendiente)}</p>
          </div>
          <div className={cx.card + ' p-4'}>
            <div className="flex items-center gap-2 mb-1.5">
              <Truck size={16} className="text-stone-400" />
              <span className="text-xs text-stone-500">Entregas hoy</span>
            </div>
            <p className="text-lg font-bold text-stone-800">{resumen.entregas_hoy ?? 0}</p>
          </div>
          <div className={cx.card + ' p-4'}>
            <div className="flex items-center gap-2 mb-1.5">
              <ClipboardList size={16} className="text-stone-400" />
              <span className="text-xs text-stone-500">Pedidos activos</span>
            </div>
            <p className="text-lg font-bold text-stone-800">{resumen.pedidos_activos ?? 0}</p>
          </div>
        </div>
      )}

      {/* Orders list */}
      {pedidos.length === 0 ? (
        <div className={cx.card + ' p-12 text-center'}>
          <ClipboardList size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 text-sm">No hay pedidos {filtroEstado ? 'con este filtro' : 'registrados'}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={cx.card + ' hidden lg:block overflow-hidden'}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>#</th>
                  <th className={cx.th}>Descripcion</th>
                  <th className={cx.th}>Cliente</th>
                  <th className={cx.th}>Estado</th>
                  <th className={cx.th + ' text-right'}>Total</th>
                  <th className={cx.th + ' text-right'}>Pagado</th>
                  <th className={cx.th + ' text-right'}>Pendiente</th>
                  <th className={cx.th}>Entrega</th>
                  <th className={cx.th + ' w-48'}></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map(p => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={cx.td + ' text-stone-400 font-mono text-xs'}>{p.id}</td>
                    <td className={cx.td + ' font-medium text-stone-900'}>{p.descripcion}</td>
                    <td className={cx.td + ' text-stone-600 text-xs'}>{p.cliente_nombre || 'Sin cliente'}</td>
                    <td className={cx.td}>
                      <span className={estadoBadge(p.estado)}>{p.estado?.replace('_', ' ')}</span>
                    </td>
                    <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(p.monto_total)}</td>
                    <td className={cx.td + ' text-right text-emerald-600'}>{formatCurrency(p.monto_pagado)}</td>
                    <td className={cx.td + ' text-right'}>
                      {parseFloat(p.monto_pendiente) > 0
                        ? <span className="text-amber-600">{formatCurrency(p.monto_pendiente)}</span>
                        : <span className="text-stone-300">-</span>
                      }
                    </td>
                    <td className={cx.td + ' text-xs text-stone-500'}>
                      {p.fecha_entrega_estimada ? formatDate(p.fecha_entrega_estimada) : '-'}
                      {p.fecha_entrega_estimada && new Date(p.fecha_entrega_estimada) < new Date() && !['pagado', 'cancelado', 'entregado'].includes(p.estado) && (
                        <span className="text-rose-500 ml-1 font-medium">Vencido</span>
                      )}
                    </td>
                    <td className={cx.td}>
                      <div className="flex items-center gap-1 justify-end">
                        {parseFloat(p.monto_pendiente) > 0 && p.estado !== 'cancelado' && (
                          <button onClick={() => openPagoModal(p)} className={cx.btnGhost + ' text-xs text-emerald-600'}>
                            Pago
                          </button>
                        )}
                        {['pendiente', 'en_produccion', 'listo'].includes(p.estado) && (
                          <button onClick={() => handleEntregar(p.id)} className={cx.btnGhost + ' text-xs'}>
                            Entregar
                          </button>
                        )}
                        {['pendiente', 'en_produccion'].includes(p.estado) && (
                          <CustomSelect
                            compact
                            options={ESTADO_UPDATE_OPTIONS}
                            value={p.estado}
                            onChange={(v) => handleUpdateEstado(p.id, v)}
                            className="w-28"
                          />
                        )}
                        <button onClick={() => loadDetalle(p.id)} className={cx.btnGhost + ' text-xs'}>
                          Detalle
                        </button>
                        {p.estado !== 'cancelado' && p.estado !== 'pagado' && (
                          <button onClick={() => setCancelTarget(p)} className={cx.btnDanger + ' text-xs'}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {pedidos.map(p => {
              const isExpanded = expanded[p.id];
              const pctPaid = parseFloat(p.monto_total) > 0
                ? Math.min((parseFloat(p.monto_pagado) / parseFloat(p.monto_total)) * 100, 100)
                : 0;

              return (
                <div key={p.id} className={cx.card + ' p-4'}>
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {isExpanded
                        ? <ChevronUp size={16} className="text-stone-400 mt-0.5 flex-shrink-0" />
                        : <ChevronDown size={16} className="text-stone-400 mt-0.5 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-stone-900 truncate">#{p.id} — {p.descripcion}</h3>
                        <p className="text-xs text-stone-500">{p.cliente_nombre || 'Sin cliente'} · {formatDate(p.fecha_pedido)}</p>
                      </div>
                    </div>
                    <span className={estadoBadge(p.estado)}>{p.estado?.replace('_', ' ')}</span>
                  </div>

                  {/* Financial summary */}
                  <div className="flex gap-4 text-xs mt-2 mb-3">
                    <span className="text-stone-500">Total: <strong className="text-stone-800">{formatCurrency(p.monto_total)}</strong></span>
                    <span className="text-emerald-600">Pagado: {formatCurrency(p.monto_pagado)}</span>
                    {parseFloat(p.monto_pendiente) > 0 && (
                      <span className="text-amber-600">Pendiente: {formatCurrency(p.monto_pendiente)}</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  {p.tipo_pago === 'contra_entrega' && (
                    <div className="h-1.5 bg-stone-100 rounded-full mb-3 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-colors"
                        style={{ width: `${pctPaid}%` }}
                      />
                    </div>
                  )}

                  {/* Delivery date */}
                  {p.fecha_entrega_estimada && (
                    <p className="text-xs text-stone-400 mb-2">
                      Entrega: {formatDate(p.fecha_entrega_estimada)}
                      {new Date(p.fecha_entrega_estimada) < new Date() && !['pagado', 'cancelado', 'entregado'].includes(p.estado) && (
                        <span className="text-rose-500 ml-1">· Vencido</span>
                      )}
                    </p>
                  )}

                  {/* Expanded actions */}
                  {isExpanded && (
                    <div className="flex flex-wrap gap-1 border-t border-stone-100 pt-2 mt-2">
                      {parseFloat(p.monto_pendiente) > 0 && p.estado !== 'cancelado' && (
                        <button onClick={() => openPagoModal(p)} className={cx.btnGhost + ' text-xs text-emerald-600'}>
                          Registrar pago
                        </button>
                      )}
                      {['pendiente', 'en_produccion', 'listo'].includes(p.estado) && (
                        <button onClick={() => handleEntregar(p.id)} className={cx.btnGhost + ' text-xs'}>
                          Entregar
                        </button>
                      )}
                      {['pendiente', 'en_produccion'].includes(p.estado) && (
                        <CustomSelect
                          compact
                          options={ESTADO_UPDATE_OPTIONS}
                          value={p.estado}
                          onChange={(v) => handleUpdateEstado(p.id, v)}
                          className="w-28"
                        />
                      )}
                      <button onClick={() => loadDetalle(p.id)} className={cx.btnGhost + ' text-xs'}>
                        Detalle
                      </button>
                      {p.estado !== 'cancelado' && p.estado !== 'pagado' && (
                        <button onClick={() => setCancelTarget(p)} className={cx.btnDanger + ' text-xs'}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Payment Modal */}
      {showPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPago(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-stone-900">Registrar pago</h3>
                <button onClick={() => setShowPago(null)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              {/* Pedido info */}
              <div className="p-3 bg-stone-50 rounded-lg mb-4">
                <p className="text-sm font-medium text-stone-800">#{showPago.id} — {showPago.descripcion}</p>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className="text-stone-500">Total: <strong>{formatCurrency(showPago.monto_total)}</strong></span>
                  <span className="text-emerald-600">Pagado: {formatCurrency(showPago.monto_pagado)}</span>
                  <span className="text-amber-600">Pendiente: {formatCurrency(showPago.monto_pendiente)}</span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Monto */}
                <div>
                  <label className={cx.label}>Monto</label>
                  <input
                    type="number"
                    value={pagoForm.monto}
                    onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))}
                    className={cx.input}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>

                {/* Metodo */}
                <div>
                  <label className={cx.label}>Metodo de pago</label>
                  <CustomSelect
                    options={METODO_PAGO_OPTIONS}
                    value={pagoForm.metodo_pago}
                    onChange={v => setPagoForm(f => ({ ...f, metodo_pago: v }))}
                  />
                </div>

                {/* Cuenta */}
                {cuentas.length > 0 && (
                  <div>
                    <label className={cx.label}>Cuenta</label>
                    <CustomSelect
                      options={[{ value: '', label: 'Sin especificar' }, ...cuentas]}
                      value={pagoForm.cuenta_id}
                      onChange={v => setPagoForm(f => ({ ...f, cuenta_id: v }))}
                    />
                  </div>
                )}

                {/* Notas */}
                <div>
                  <label className={cx.label}>Notas (opcional)</label>
                  <input
                    type="text"
                    value={pagoForm.notas}
                    onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))}
                    className={cx.input}
                    placeholder="Referencia, detalle..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={handleRegistrarPago} disabled={savingPago} className={cx.btnPrimary + ' flex-1'}>
                  {savingPago ? 'Registrando...' : 'Registrar pago'}
                </button>
                <button onClick={() => setShowPago(null)} className={cx.btnSecondary}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetalle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-stone-900">Pedido #{detalle.id}</h3>
                <button onClick={() => setDetalle(null)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              {/* Info */}
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-500">Descripcion</span>
                  <span className="text-sm font-medium text-stone-900">{detalle.descripcion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-500">Cliente</span>
                  <span className="text-sm text-stone-800">{detalle.cliente_nombre || 'Sin cliente'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-500">Estado</span>
                  <span className={estadoBadge(detalle.estado)}>{detalle.estado?.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-500">Tipo de pago</span>
                  <span className="text-sm text-stone-800">{detalle.tipo_pago === 'contra_entrega' ? 'Contra entrega' : 'Contado'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-500">Fecha pedido</span>
                  <span className="text-sm text-stone-800">{formatDate(detalle.fecha_pedido)}</span>
                </div>
                {detalle.fecha_entrega_estimada && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-500">Entrega estimada</span>
                    <span className="text-sm text-stone-800">{formatDate(detalle.fecha_entrega_estimada)}</span>
                  </div>
                )}
                {detalle.fecha_entrega_real && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-500">Entrega real</span>
                    <span className="text-sm text-stone-800">{formatDate(detalle.fecha_entrega_real)}</span>
                  </div>
                )}
                {detalle.notas && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm text-stone-500">Notas</span>
                    <span className="text-sm text-stone-600 text-right max-w-[60%]">{detalle.notas}</span>
                  </div>
                )}

                {/* Amounts */}
                <div className="border-t border-stone-100 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-500">Total</span>
                    <span className="text-sm font-bold text-stone-900">{formatCurrency(detalle.monto_total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-500">Pagado</span>
                    <span className="text-sm font-semibold text-emerald-600">{formatCurrency(detalle.monto_pagado)}</span>
                  </div>
                  {parseFloat(detalle.monto_pendiente) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-stone-500">Pendiente</span>
                      <span className="text-sm font-semibold text-amber-600">{formatCurrency(detalle.monto_pendiente)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment history */}
              {detalle.pagos && detalle.pagos.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-stone-700 mb-3">Historial de pagos</h4>
                  <div className="space-y-2">
                    {detalle.pagos.map((pago, idx) => (
                      <div key={pago.id || idx} className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <CreditCard size={14} className="text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-stone-900">{formatCurrency(pago.monto)}</span>
                            <span className={cx.badge(
                              pago.tipo === 'adelanto' ? 'bg-sky-50 text-sky-600'
                              : pago.tipo === 'restante' ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-stone-100 text-stone-500'
                            )}>
                              {pago.tipo || 'parcial'}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {formatDate(pago.fecha)} · {pago.metodo_pago || 'efectivo'}
                          </p>
                          {pago.notas && (
                            <p className="text-xs text-stone-400 mt-0.5">{pago.notas}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button onClick={() => setDetalle(null)} className={cx.btnSecondary}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm cancel */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancelar pedido"
        message={`Estas seguro de cancelar el pedido #${cancelTarget?.id} "${cancelTarget?.descripcion}"?`}
        onConfirm={handleCancelar}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
