import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, ChevronDown, ChevronUp,
  ShoppingBag, Package, Salad, DollarSign,
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

const EMPTY_ITEM = { tipo: 'insumo', insumo_id: null, material_id: null, nombre_item: '', cantidad: '', unidad: '', precio_unitario: '' };

export default function PLComprasPage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [compras, setCompras] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [insumos, setInsumos] = useState([]);
  const [materiales, setMateriales] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal form
  const [form, setForm] = useState({ fecha: todayStr(), proveedor: '', nota: '' });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  // Load periodos + catalogs on mount
  useEffect(() => {
    Promise.all([
      api.get('/pl/periodos').catch(() => ({ data: [] })),
      api.get('/insumos').catch(() => ({ data: [] })),
      api.get('/materiales').catch(() => ({ data: [] })),
    ]).then(([perRes, insRes, matRes]) => {
      const pers = perRes.data || [];
      setPeriodos(pers);
      setInsumos(insRes.data || []);
      setMateriales(matRes.data || []);
      if (pers.length > 0) setPeriodoId(pers[0].id);
      setLoading(false);
    });
  }, []);

  // Load compras + resumen when periodo changes
  const loadCompras = async (pid) => {
    if (!pid) return;
    setLoadingCompras(true);
    try {
      const [comprasRes, resumenRes] = await Promise.all([
        api.get(`/pl/compras?periodo_id=${pid}`),
        api.get(`/pl/compras/resumen?periodo_id=${pid}`),
      ]);
      setCompras(comprasRes.data || []);
      setResumen(resumenRes.data || null);
    } catch {
      toast.error('Error cargando compras');
    } finally {
      setLoadingCompras(false);
    }
  };

  useEffect(() => {
    if (periodoId) loadCompras(periodoId);
  }, [periodoId]); // eslint-disable-line

  const periodoOptions = useMemo(() =>
    periodos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [periodos]
  );

  // Create first period
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

  // Modal helpers
  const openNewCompra = () => {
    setForm({ fecha: todayStr(), proveedor: '', nota: '' });
    setItems([{ ...EMPTY_ITEM }]);
    setModalOpen(true);
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (idx) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      // Reset linked fields when tipo changes
      if (field === 'tipo') {
        updated.insumo_id = null;
        updated.material_id = null;
        updated.nombre_item = '';
        updated.unidad = '';
      }
      return updated;
    }));
  };

  const selectInsumo = (idx, ins) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, insumo_id: ins.id, unidad: ins.unidad || '' };
    }));
  };

  const selectMaterial = (idx, mat) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, material_id: mat.id, unidad: mat.unidad || '' };
    }));
  };

  // Computed total
  const formTotal = useMemo(() =>
    items.reduce((s, item) => s + ((parseFloat(item.precio_unitario) || 0) * (parseFloat(item.cantidad) || 0)), 0),
    [items]
  );

  const itemSubtotal = (item) =>
    (parseFloat(item.precio_unitario) || 0) * (parseFloat(item.cantidad) || 0);

  // Save
  const saveCompra = async () => {
    if (!form.fecha) { toast.error('Fecha es requerida'); return; }
    const validItems = items.filter((it) =>
      (parseFloat(it.cantidad) > 0) && (parseFloat(it.precio_unitario) > 0) &&
      (it.insumo_id || it.material_id || it.nombre_item)
    );
    if (validItems.length === 0) { toast.error('Agrega al menos un item valido'); return; }

    setSaving(true);
    try {
      await api.post('/pl/compras', {
        periodo_id: periodoId,
        fecha: form.fecha,
        proveedor: form.proveedor || null,
        nota: form.nota || null,
        items: validItems.map((it) => ({
          insumo_id: it.insumo_id || null,
          material_id: it.material_id || null,
          nombre_item: it.nombre_item || null,
          cantidad: parseFloat(it.cantidad),
          unidad: it.unidad || null,
          precio_unitario: parseFloat(it.precio_unitario),
        })),
      });
      toast.success('Compra registrada');
      setModalOpen(false);
      loadCompras(periodoId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/pl/compras/${deleteTarget.id}`);
      toast.success('Compra eliminada');
      loadCompras(periodoId);
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Toggle accordion
  const toggleCompra = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  // No periods
  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-2xl font-bold text-stone-900 mb-8">Compras</h1>
        <div className={`${cx.card} p-12 text-center`}>
          <ShoppingBag size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-sm mb-6">
            Para registrar compras, primero necesitas crear un periodo contable.
          </p>
          <button onClick={crearPrimerPeriodo} disabled={creatingPeriodo} className={cx.btnPrimary}>
            {creatingPeriodo ? 'Creando...' : 'Crear primer periodo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Compras</h1>
          <CustomSelect
            value={String(periodoId)}
            onChange={(v) => setPeriodoId(parseInt(v))}
            options={periodoOptions}
            placeholder="Periodo"
            className="w-48"
          />
        </div>
        <button onClick={openNewCompra} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nueva compra
        </button>
      </div>

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            icon={<Salad size={18} />}
            label="Compras Insumos"
            value={formatCurrency(resumen.total_insumos)}
            color="text-teal-600"
          />
          <SummaryCard
            icon={<Package size={18} />}
            label="Compras Materiales"
            value={formatCurrency(resumen.total_materiales)}
            color="text-blue-600"
          />
          <SummaryCard
            icon={<DollarSign size={18} />}
            label="Total Compras"
            value={formatCurrency(resumen.total_compras)}
            color="text-rose-600"
            bold
          />
        </div>
      )}

      {/* Compras list */}
      {loadingCompras ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : compras.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <p className="text-stone-400 text-sm">No hay compras registradas en este periodo</p>
        </div>
      ) : (
        <div className={`${cx.card} divide-y divide-stone-100 overflow-hidden`}>
          {compras.map((compra) => {
            const isExpanded = expanded[compra.id] === true;
            return (
              <div key={compra.id}>
                {/* Compra header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-stone-50/50 transition-colors"
                  onClick={() => toggleCompra(compra.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded
                      ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {formatDate(compra.fecha)}
                        {compra.proveedor && <span className="text-stone-500 font-normal"> - {compra.proveedor}</span>}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {compra.items?.length || 0} item{(compra.items?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-sm font-semibold text-stone-900">{formatCurrency(compra.total)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(compra); }}
                      className={cx.btnIcon + ' !p-1 hover:text-rose-600'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded: items table */}
                {isExpanded && compra.items && (
                  <div className="px-5 pb-4">
                    {/* Desktop */}
                    <div className="hidden sm:block">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-stone-100">
                            <th className={cx.th}>Item</th>
                            <th className={cx.th + ' text-right'}>Cantidad</th>
                            <th className={cx.th + ' text-center'}>Unidad</th>
                            <th className={cx.th + ' text-right'}>Precio unit.</th>
                            <th className={cx.th + ' text-right'}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compra.items.map((it) => (
                            <tr key={it.id} className={cx.tr}>
                              <td className={cx.td + ' font-medium text-stone-900'}>{it.item_nombre || it.nombre_item || '-'}</td>
                              <td className={cx.td + ' text-right text-stone-600'}>{parseFloat(it.cantidad)}</td>
                              <td className={cx.td + ' text-center text-stone-500'}>{it.unidad || '-'}</td>
                              <td className={cx.td + ' text-right text-stone-600'}>{formatCurrency(it.precio_unitario)}</td>
                              <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile */}
                    <div className="sm:hidden space-y-2">
                      {compra.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between py-2 pl-7">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-800 truncate">{it.item_nombre || it.nombre_item || '-'}</p>
                            <p className="text-[11px] text-stone-400">
                              {parseFloat(it.cantidad)} {it.unidad || ''} x {formatCurrency(it.precio_unitario)}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-stone-900 flex-shrink-0 ml-3">
                            {formatCurrency(it.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {compra.nota && (
                      <p className="text-xs text-stone-400 mt-3 pl-7">Nota: {compra.nota}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nueva compra modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-stone-900">Nueva compra</h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              {/* Header: fecha + proveedor */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className={cx.label}>Fecha</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className={cx.input}
                  />
                </div>
                <div>
                  <label className={cx.label}>Proveedor (opcional)</label>
                  <input
                    type="text"
                    value={form.proveedor}
                    onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Mercado central"
                  />
                </div>
              </div>

              {/* Items */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Items</p>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="border border-stone-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        {/* Type selector */}
                        <CustomSelect
                          value={item.tipo}
                          onChange={(v) => updateItem(idx, 'tipo', v)}
                          options={[
                            { value: 'insumo', label: 'Insumo' },
                            { value: 'material', label: 'Material' },
                            { value: 'otro', label: 'Otro' },
                          ]}
                          compact
                          className="w-28"
                        />
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className={cx.btnIcon + ' !p-1 hover:text-rose-600'}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Item selector based on type */}
                      {item.tipo === 'insumo' && (
                        <div className="mb-2">
                          <SearchableSelect
                            options={insumos}
                            value={item.insumo_id}
                            onChange={(ins) => selectInsumo(idx, ins)}
                            placeholder="Buscar insumo..."
                          />
                        </div>
                      )}
                      {item.tipo === 'material' && (
                        <div className="mb-2">
                          <SearchableSelect
                            options={materiales}
                            value={item.material_id}
                            onChange={(mat) => selectMaterial(idx, mat)}
                            placeholder="Buscar material..."
                          />
                        </div>
                      )}
                      {item.tipo === 'otro' && (
                        <div className="mb-2">
                          <input
                            type="text"
                            value={item.nombre_item}
                            onChange={(e) => updateItem(idx, 'nombre_item', e.target.value)}
                            className={cx.input}
                            placeholder="Nombre del item"
                          />
                        </div>
                      )}

                      {/* Quantity + unit + price */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-stone-400 font-medium">Cantidad</label>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                            className={cx.input}
                            placeholder="0"
                            min="0"
                            step="any"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-stone-400 font-medium">Unidad</label>
                          <input
                            type="text"
                            value={item.unidad}
                            onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                            className={cx.input}
                            placeholder="kg, und..."
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-stone-400 font-medium">Precio unit.</label>
                          <input
                            type="number"
                            value={item.precio_unitario}
                            onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                            className={cx.input}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>

                      {/* Subtotal */}
                      <div className="text-right text-xs font-semibold text-stone-600 mt-2">
                        Subtotal: {formatCurrency(itemSubtotal(item))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={addItem} className={cx.btnGhost + ' w-full flex items-center justify-center gap-1 text-xs mb-4'}>
                <Plus size={14} /> Agregar item
              </button>

              {/* Nota */}
              <div className="mb-4">
                <label className={cx.label}>Nota (opcional)</label>
                <input
                  type="text"
                  value={form.nota}
                  onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
                  className={cx.input}
                  placeholder="Ej: Compra semanal"
                />
              </div>

              {/* Total */}
              <div className="border-t border-stone-200 pt-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-500">Total</span>
                  <span className="text-xl font-bold text-stone-900">{formatCurrency(formTotal)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={saveCompra} disabled={saving} className={cx.btnPrimary + ' flex-1'}>
                  {saving ? 'Guardando...' : 'Guardar compra'}
                </button>
                <button onClick={() => setModalOpen(false)} className={cx.btnSecondary}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar compra"
        message={`Estas seguro de eliminar esta compra de ${formatCurrency(deleteTarget?.total)}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SummaryCard({ icon, label, value, color, bold }) {
  return (
    <div className={`${cx.card} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={color || 'text-stone-400'}>{icon}</span>
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <p className={`text-xl ${bold ? 'font-extrabold' : 'font-bold'} text-stone-900`}>
        {value}
      </p>
    </div>
  );
}
