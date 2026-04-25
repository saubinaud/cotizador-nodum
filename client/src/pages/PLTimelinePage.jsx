import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, TrendingUp, Package, Receipt,
  ShoppingCart, Activity,
} from 'lucide-react';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const fin = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { nombre: `${MESES[m]} ${y}`, fecha_inicio: inicio, fecha_fin: fin };
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';

  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Timeline item component
function TimelineItem({ t, onDelete }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        t.tipo === 'venta' ? 'bg-teal-50 text-teal-600' :
        t.tipo === 'compra' ? 'bg-amber-50 text-amber-600' :
        'bg-rose-50 text-rose-600'
      }`}>
        {t.tipo === 'venta' ? <TrendingUp size={14} /> :
         t.tipo === 'compra' ? <Package size={14} /> :
         <Receipt size={14} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800 truncate">
              {t.tipo === 'venta'
                ? `${t.producto_nombre || 'Producto'} ${t.cantidad > 1 ? `\u00d7${t.cantidad}` : ''}`
                : t.tipo === 'compra'
                  ? `Compra \u2014 ${t.descripcion || 'Sin proveedor'}`
                  : `${t.categoria_nombre || t.descripcion || 'Gasto'}`}
            </p>
            {t.nota && <p className="text-xs text-stone-400 mt-0.5 truncate">{t.nota}</p>}
            {t.tipo === 'gasto' && t.descripcion && t.categoria_nombre && (
              <p className="text-xs text-stone-400 mt-0.5 truncate">{t.descripcion}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm font-semibold tabular-nums ${
              t.monto >= 0 ? 'text-teal-600' : 'text-rose-600'
            }`}>
              {t.monto >= 0 ? '+' : ''}{formatCurrency(t.monto)}
            </span>
            <button
              onClick={() => onDelete(t)}
              className="p-1 text-stone-300 hover:text-rose-500 transition-colors opacity-0 group-hover/item:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PLTimelinePage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [transacciones, setTransacciones] = useState([]);
  const [balance, setBalance] = useState(null);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterTipo, setFilterTipo] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);

  // New transaction form
  const [tipoNuevo, setTipoNuevo] = useState('venta');
  const [form, setForm] = useState({
    producto_id: null,
    fecha: todayStr(),
    cantidad: 1,
    precio_unitario: '',
    categoria_id: null,
    monto_absoluto: '',
    descripcion: '',
    nota: '',
    descuento_tipo: 'none',
    descuento_valor: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Load initial data
  useEffect(() => {
    Promise.all([
      api.get('/pl/periodos').catch(() => ({ data: [] })),
      api.get('/productos').catch(() => ({ data: [] })),
      api.get('/pl/categorias').catch(() => ({ data: [] })),
    ]).then(([perRes, prodRes, catRes]) => {
      const pers = perRes.data || [];
      setPeriodos(pers);
      setProductos(prodRes.data || []);
      setCategorias(catRes.data || []);
      if (pers.length > 0) setPeriodoId(pers[0].id);
      setLoading(false);
    });
  }, []);

  // Load transacciones + balance when periodo changes
  const loadData = async (pid, tipo) => {
    if (!pid) return;
    setLoadingTx(true);
    try {
      const tipoParam = tipo ? `&tipo=${tipo}` : '';
      const [txRes, balRes] = await Promise.all([
        api.get(`/pl/transacciones?periodo_id=${pid}${tipoParam}`),
        api.get(`/pl/transacciones/balance?periodo_id=${pid}`),
      ]);
      setTransacciones(txRes.data || []);
      setBalance(balRes.data || null);
    } catch {
      toast.error('Error cargando transacciones');
    }
    setLoadingTx(false);
  };

  useEffect(() => {
    if (periodoId) loadData(periodoId, filterTipo);
  }, [periodoId, filterTipo]); // eslint-disable-line

  // Group by date
  const grouped = useMemo(() => {
    const groups = {};
    transacciones.forEach(t => {
      const date = t.fecha?.slice(0, 10);
      if (!groups[date]) groups[date] = [];
      groups[date].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [transacciones]);

  // Auto-create current month period
  const handleCreatePeriodo = async () => {
    setCreatingPeriodo(true);
    try {
      const cp = currentMonthPeriod();
      const res = await api.post('/pl/periodos', cp);
      setPeriodos(prev => [res.data, ...prev]);
      setPeriodoId(res.data.id);
      toast.success('Periodo creado');
    } catch (e) {
      toast.error(e.message);
    }
    setCreatingPeriodo(false);
  };

  // Submit new transaction
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        tipo: tipoNuevo,
        periodo_id: periodoId,
        fecha: form.fecha,
        nota: form.nota || null,
      };

      if (tipoNuevo === 'venta') {
        if (!form.producto_id) { toast.error('Selecciona un producto'); setSubmitting(false); return; }
        body.producto_id = form.producto_id;
        body.cantidad = parseInt(form.cantidad) || 1;
        body.precio_unitario = form.precio_unitario ? parseFloat(form.precio_unitario) : null;
        body.descuento_tipo = form.descuento_tipo;
        body.descuento_valor = form.descuento_valor ? parseFloat(form.descuento_valor) : 0;
      } else if (tipoNuevo === 'gasto') {
        if (!form.categoria_id) { toast.error('Selecciona una categoria'); setSubmitting(false); return; }
        if (!form.monto_absoluto) { toast.error('Ingresa el monto'); setSubmitting(false); return; }
        body.categoria_id = form.categoria_id;
        body.monto_absoluto = parseFloat(form.monto_absoluto);
        body.descripcion = form.descripcion || null;
      } else if (tipoNuevo === 'compra') {
        if (!form.monto_absoluto) { toast.error('Ingresa el monto'); setSubmitting(false); return; }
        body.monto_absoluto = parseFloat(form.monto_absoluto);
        body.descripcion = form.descripcion || null;
      }

      await api.post('/pl/transacciones', body);
      toast.success('Transaccion registrada');
      setModalOpen(false);
      resetForm();
      loadData(periodoId, filterTipo);
    } catch (e) {
      toast.error(e.message);
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setForm({
      producto_id: null, fecha: todayStr(), cantidad: 1, precio_unitario: '',
      categoria_id: null, monto_absoluto: '', descripcion: '', nota: '',
      descuento_tipo: 'none', descuento_valor: '',
    });
    setTipoNuevo('venta');
  };

  // Delete transaction
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/pl/transacciones/${deleteTarget.id}`);
      toast.success('Transaccion eliminada');
      setDeleteTarget(null);
      loadData(periodoId, filterTipo);
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Auto-fill price when product selected
  const handleProductChange = (prodId) => {
    setForm(prev => {
      const prod = productos.find(p => p.id === prodId);
      return { ...prev, producto_id: prodId, precio_unitario: prod?.precio_final || '' };
    });
  };

  const periodoOptions = periodos.map(p => ({ value: p.id, label: p.nombre }));
  const filterOptions = [
    { value: '', label: 'Todas' },
    { value: 'venta', label: 'Ventas' },
    { value: 'compra', label: 'Compras' },
    { value: 'gasto', label: 'Gastos' },
  ];

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className={`${cx.skeleton} h-10 w-48`} />
        <div className={`${cx.skeleton} h-20`} />
        <div className={`${cx.skeleton} h-64`} />
      </div>
    );
  }

  // No periods yet
  if (periodos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">Timeline</h1>
        <div className={`${cx.card} p-8 text-center`}>
          <Activity size={32} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm mb-4">Crea tu primer periodo para empezar a registrar transacciones.</p>
          <button onClick={handleCreatePeriodo} disabled={creatingPeriodo} className={cx.btnPrimary}>
            {creatingPeriodo ? 'Creando...' : 'Crear periodo actual'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Timeline</h1>
        <button
          onClick={() => { resetForm(); setModalOpen(true); }}
          className={cx.btnPrimary + ' flex items-center gap-2'}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      {/* Period selector + filter */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <CustomSelect
            options={periodoOptions}
            value={periodoId}
            onChange={setPeriodoId}
            placeholder="Periodo..."
          />
        </div>
        <div className="w-32">
          <CustomSelect
            options={filterOptions}
            value={filterTipo || ''}
            onChange={(v) => setFilterTipo(v || null)}
            placeholder="Filtro"
          />
        </div>
      </div>

      {/* Balance summary cards */}
      {balance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className={`${cx.card} p-4`}>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Ingresos</p>
            <p className="text-base font-bold text-teal-600 tabular-nums">{formatCurrency(balance.ingresos)}</p>
          </div>
          <div className={`${cx.card} p-4`}>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Compras</p>
            <p className="text-base font-bold text-amber-600 tabular-nums">{formatCurrency(balance.compras)}</p>
          </div>
          <div className={`${cx.card} p-4`}>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Gastos</p>
            <p className="text-base font-bold text-rose-600 tabular-nums">{formatCurrency(balance.gastos)}</p>
          </div>
          <div className={`${cx.card} p-4`}>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Balance</p>
            <p className={`text-base font-bold tabular-nums ${parseFloat(balance.balance) >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
              {formatCurrency(balance.balance)}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loadingTx ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className={`${cx.skeleton} h-16`} />)}
        </div>
      ) : transacciones.length === 0 ? (
        <div className={`${cx.card} p-8 text-center`}>
          <Activity size={28} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">Sin transacciones en este periodo.</p>
          <button onClick={() => { resetForm(); setModalOpen(true); }} className="text-[var(--accent)] text-sm font-semibold mt-2">
            Registrar primera transaccion
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider py-2 sticky top-0 bg-[#f7f7f7] z-10">
                {formatDateLabel(date)}
              </p>
              <div className={`${cx.card} divide-y divide-stone-100`}>
                {items.map(t => (
                  <div key={t.id} className="group/item">
                    <TimelineItem t={t} onDelete={setDeleteTarget} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB for mobile */}
      <button
        onClick={() => { resetForm(); setModalOpen(true); }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-150 active:scale-95 lg:hidden z-20"
      >
        <Plus size={24} />
      </button>

      {/* Quick-add modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 pb-0">
              <h2 className="text-lg font-bold text-stone-900">Nueva transaccion</h2>
              <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              {/* Tab buttons */}
              <div className="flex gap-1 p-1 bg-stone-100 rounded-lg mb-5">
                {[
                  { key: 'venta', label: 'Venta', icon: TrendingUp },
                  { key: 'compra', label: 'Compra', icon: Package },
                  { key: 'gasto', label: 'Gasto', icon: Receipt },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTipoNuevo(tab.key)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                      tipoNuevo === tab.key
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Date field — shared */}
              <div className="mb-4">
                <label className={cx.label}>Fecha</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm(prev => ({ ...prev, fecha: e.target.value }))}
                  className={cx.input}
                />
              </div>

              {/* VENTA form */}
              {tipoNuevo === 'venta' && (
                <>
                  <div className="mb-4">
                    <label className={cx.label}>Producto</label>
                    <SearchableSelect
                      options={productos}
                      value={form.producto_id}
                      onChange={handleProductChange}
                      placeholder="Buscar producto..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className={cx.label}>Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={form.cantidad}
                        onChange={e => setForm(prev => ({ ...prev, cantidad: e.target.value }))}
                        className={cx.input}
                      />
                    </div>
                    <div>
                      <label className={cx.label}>Precio unit.</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.precio_unitario}
                        onChange={e => setForm(prev => ({ ...prev, precio_unitario: e.target.value }))}
                        placeholder="Automatico"
                        className={cx.input}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className={cx.label}>Descuento</label>
                      <CustomSelect
                        options={[
                          { value: 'none', label: 'Sin descuento' },
                          { value: 'percent', label: '% Porcentaje' },
                          { value: 'total', label: 'Monto total' },
                          { value: 'unit', label: 'Por unidad' },
                        ]}
                        value={form.descuento_tipo}
                        onChange={v => setForm(prev => ({ ...prev, descuento_tipo: v }))}
                      />
                    </div>
                    {form.descuento_tipo !== 'none' && (
                      <div>
                        <label className={cx.label}>Valor</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.descuento_valor}
                          onChange={e => setForm(prev => ({ ...prev, descuento_valor: e.target.value }))}
                          className={cx.input}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* GASTO form */}
              {tipoNuevo === 'gasto' && (
                <>
                  <div className="mb-4">
                    <label className={cx.label}>Categoria</label>
                    <SearchableSelect
                      options={categorias}
                      value={form.categoria_id}
                      onChange={v => setForm(prev => ({ ...prev, categoria_id: v }))}
                      placeholder="Buscar categoria..."
                    />
                  </div>
                  <div className="mb-4">
                    <label className={cx.label}>Monto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.monto_absoluto}
                      onChange={e => setForm(prev => ({ ...prev, monto_absoluto: e.target.value }))}
                      placeholder="0.00"
                      className={cx.input}
                    />
                  </div>
                  <div className="mb-4">
                    <label className={cx.label}>Descripcion</label>
                    <input
                      type="text"
                      value={form.descripcion}
                      onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                      placeholder="Opcional"
                      className={cx.input}
                    />
                  </div>
                </>
              )}

              {/* COMPRA form */}
              {tipoNuevo === 'compra' && (
                <>
                  <div className="mb-4">
                    <label className={cx.label}>Monto total</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.monto_absoluto}
                      onChange={e => setForm(prev => ({ ...prev, monto_absoluto: e.target.value }))}
                      placeholder="0.00"
                      className={cx.input}
                    />
                  </div>
                  <div className="mb-4">
                    <label className={cx.label}>Proveedor / Descripcion</label>
                    <input
                      type="text"
                      value={form.descripcion}
                      onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                      placeholder="Opcional"
                      className={cx.input}
                    />
                  </div>
                </>
              )}

              {/* Nota — shared */}
              <div className="mb-5">
                <label className={cx.label}>Nota</label>
                <input
                  type="text"
                  value={form.nota}
                  onChange={e => setForm(prev => ({ ...prev, nota: e.target.value }))}
                  placeholder="Opcional"
                  className={cx.input}
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`${cx.btnPrimary} w-full flex items-center justify-center gap-2`}
              >
                {submitting ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar transaccion"
        message="Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
