import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, Pencil, ChevronDown, ChevronUp,
  DollarSign, TrendingUp, Package, ShoppingCart,
} from 'lucide-react';

// Month names in Spanish
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

export default function PLVentasPage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [productos, setProductos] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVenta, setEditingVenta] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);

  // Modal form
  const [form, setForm] = useState({
    producto_id: null,
    fecha: todayStr(),
    cantidad: 1,
    precio_unitario: '',
    nota: '',
  });
  const [descuentoTipo, setDescuentoTipo] = useState('none');
  const [descuentoValor, setDescuentoValor] = useState('');

  // Load periodos + productos on mount
  useEffect(() => {
    Promise.all([
      api.get('/pl/periodos').catch(() => ({ data: [] })),
      api.get('/productos').catch(() => ({ data: [] })),
    ]).then(([perRes, prodRes]) => {
      const pers = perRes.data || [];
      setPeriodos(pers);
      setProductos(prodRes.data || []);
      if (pers.length > 0) {
        setPeriodoId(pers[0].id);
      }
      setLoading(false);
    });
  }, []);

  // Load ventas + resumen when periodo changes
  const loadVentas = async (pid) => {
    if (!pid) return;
    setLoadingVentas(true);
    try {
      const [ventasRes, resumenRes] = await Promise.all([
        api.get(`/pl/ventas?periodo_id=${pid}`),
        api.get(`/pl/ventas/resumen?periodo_id=${pid}`),
      ]);
      setVentas(ventasRes.data || []);
      setResumen(resumenRes.data || null);
    } catch {
      toast.error('Error cargando ventas');
    } finally {
      setLoadingVentas(false);
    }
  };

  useEffect(() => {
    if (periodoId) loadVentas(periodoId);
  }, [periodoId]); // eslint-disable-line

  // Period options for CustomSelect
  const periodoOptions = useMemo(() =>
    periodos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [periodos]
  );

  // Create first period (current month)
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

  // Discount calculation
  const calcDescuento = () => {
    const val = parseFloat(descuentoValor) || 0;
    const cant = parseInt(form.cantidad) || 1;
    const precio = parseFloat(form.precio_unitario) || 0;
    switch (descuentoTipo) {
      case 'total': return val;
      case 'unit': return val * cant;
      case 'percent': return (precio * cant) * (val / 100);
      default: return 0;
    }
  };

  // Open modal for new venta
  const openNewVenta = () => {
    setEditingVenta(null);
    setForm({
      producto_id: null,
      fecha: todayStr(),
      cantidad: 1,
      precio_unitario: '',
      nota: '',
    });
    setDescuentoTipo('none');
    setDescuentoValor('');
    setModalOpen(true);
  };

  // Open modal for editing
  const openEditVenta = (v) => {
    setEditingVenta(v);
    const desc = parseFloat(v.descuento) || 0;
    setForm({
      producto_id: v.producto_id,
      fecha: v.fecha ? v.fecha.slice(0, 10) : todayStr(),
      cantidad: v.cantidad,
      precio_unitario: parseFloat(v.precio_unitario) || '',
      nota: v.nota || '',
    });
    if (desc > 0) {
      setDescuentoTipo('total');
      setDescuentoValor(String(desc));
    } else {
      setDescuentoTipo('none');
      setDescuentoValor('');
    }
    setModalOpen(true);
  };

  // Select product in modal - auto-fill price
  const selectProducto = (prod) => {
    setForm((prev) => ({
      ...prev,
      producto_id: prod.id,
      precio_unitario: parseFloat(prod.precio_final) || '',
    }));
  };

  // Computed total in modal
  const formTotal = useMemo(() => {
    const precio = parseFloat(form.precio_unitario) || 0;
    const cant = parseInt(form.cantidad) || 0;
    const desc = calcDescuento();
    return (precio * cant) - desc;
  }, [form.precio_unitario, form.cantidad, descuentoTipo, descuentoValor]);

  // Save venta
  const saveVenta = async () => {
    if (!form.producto_id || !form.fecha || !form.cantidad) {
      toast.error('Producto, fecha y cantidad son requeridos');
      return;
    }
    try {
      const descuentoTotal = calcDescuento();
      if (editingVenta) {
        await api.put(`/pl/ventas/${editingVenta.id}`, {
          cantidad: form.cantidad,
          precio_unitario: form.precio_unitario,
          descuento: descuentoTotal,
          nota: form.nota,
        });
        toast.success('Venta actualizada');
      } else {
        await api.post('/pl/ventas', {
          periodo_id: periodoId,
          producto_id: form.producto_id,
          fecha: form.fecha,
          cantidad: form.cantidad,
          precio_unitario: form.precio_unitario || undefined,
          descuento: descuentoTotal,
          nota: form.nota,
        });
        toast.success('Venta registrada');
      }
      setModalOpen(false);
      loadVentas(periodoId);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Delete venta
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/pl/ventas/${deleteTarget.id}`);
      toast.success('Venta eliminada');
      loadVentas(periodoId);
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Summary computed values
  const utilidadBruta = resumen
    ? parseFloat(resumen.ingresos_brutos) - parseFloat(resumen.cogs_total)
    : 0;

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  // No periods yet - show CTA
  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-2xl font-bold text-stone-900 mb-8">Ventas</h1>
        <div className={`${cx.card} p-12 text-center`}>
          <ShoppingCart size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-sm mb-6">
            Para registrar ventas, primero necesitas crear un periodo contable.
          </p>
          <button
            onClick={crearPrimerPeriodo}
            disabled={creatingPeriodo}
            className={cx.btnPrimary}
          >
            {creatingPeriodo ? 'Creando...' : 'Crear primer periodo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header: title + period selector + register button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Ventas</h1>
          <CustomSelect
            value={String(periodoId)}
            onChange={(v) => setPeriodoId(parseInt(v))}
            options={periodoOptions}
            placeholder="Periodo"
            className="w-48"
          />
        </div>
        <button onClick={openNewVenta} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Registrar venta
        </button>
      </div>

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            icon={<DollarSign size={18} />}
            label="Ingresos"
            value={formatCurrency(resumen.ingresos_brutos)}
            accent
          />
          <SummaryCard
            icon={<Package size={18} />}
            label="COGS"
            value={formatCurrency(resumen.cogs_total)}
          />
          <SummaryCard
            icon={<TrendingUp size={18} />}
            label="Utilidad bruta"
            value={formatCurrency(utilidadBruta)}
            positive={utilidadBruta >= 0}
          />
          <SummaryCard
            icon={<ShoppingCart size={18} />}
            label="Unidades vendidas"
            value={parseInt(resumen.unidades_vendidas) || 0}
          />
        </div>
      )}

      {/* Ventas list */}
      {loadingVentas ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : ventas.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <p className="text-stone-400 text-sm">No hay ventas registradas en este periodo</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Fecha</th>
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th + ' text-center'}>Cant.</th>
                  <th className={cx.th + ' text-right'}>Precio</th>
                  <th className={cx.th + ' text-right'}>Descuento</th>
                  <th className={cx.th + ' text-right'}>Total</th>
                  <th className={cx.th + ' w-20'}></th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className={cx.tr}>
                    <td className={cx.td + ' text-stone-600'}>{formatDate(v.fecha)}</td>
                    <td className={cx.td + ' font-medium text-stone-900'}>{v.producto_nombre}</td>
                    <td className={cx.td + ' text-center text-stone-600'}>{v.cantidad}</td>
                    <td className={cx.td + ' text-right text-stone-600'}>{formatCurrency(v.precio_unitario)}</td>
                    <td className={cx.td + ' text-right text-stone-400'}>
                      {parseFloat(v.descuento) > 0 ? `-${formatCurrency(v.descuento)}` : '-'}
                    </td>
                    <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(v.total)}</td>
                    <td className={cx.td}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEditVenta(v)} className={cx.btnIcon}><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(v)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: accordion cards */}
          <div className={`${cx.card} divide-y divide-stone-100 lg:hidden`}>
            {ventas.map((v) => {
              const isExpanded = collapsed[v.id] === true;
              return (
                <div key={v.id} className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded
                        ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                        : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{v.producto_nombre}</p>
                        <p className="text-[11px] text-stone-400">{formatDate(v.fecha)} &middot; {v.cantidad} uds</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-stone-900 flex-shrink-0 ml-3">{formatCurrency(v.total)}</span>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>
                          <span className="text-stone-400">Precio unit.</span>
                          <p className="text-stone-800 font-medium">{formatCurrency(v.precio_unitario)}</p>
                        </div>
                        <div>
                          <span className="text-stone-400">Descuento</span>
                          <p className="text-stone-800 font-medium">
                            {parseFloat(v.descuento) > 0 ? formatCurrency(v.descuento) : '-'}
                          </p>
                        </div>
                        {v.nota && (
                          <div className="col-span-2">
                            <span className="text-stone-400">Nota</span>
                            <p className="text-stone-600">{v.nota}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditVenta(v)} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                          <Pencil size={12} /> Editar
                        </button>
                        <button onClick={() => setDeleteTarget(v)} className={cx.btnDanger + ' text-xs flex items-center gap-1'}>
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Register/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-stone-900">
                  {editingVenta ? 'Editar venta' : 'Registrar venta'}
                </h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Product selector (only for new) */}
                {!editingVenta && (
                  <div>
                    <label className={cx.label}>Producto</label>
                    <SearchableSelect
                      options={productos}
                      value={form.producto_id}
                      onChange={selectProducto}
                      placeholder="Buscar producto..."
                    />
                  </div>
                )}

                {/* Date (only for new) */}
                {!editingVenta && (
                  <div>
                    <label className={cx.label}>Fecha</label>
                    <input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                      className={cx.input}
                    />
                  </div>
                )}

                {/* Quantity */}
                <div>
                  <label className={cx.label}>Cantidad</label>
                  <input
                    type="number"
                    value={form.cantidad}
                    onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
                    min="1"
                    className={cx.input}
                  />
                </div>

                {/* Unit price */}
                <div>
                  <label className={cx.label}>Precio unitario</label>
                  <input
                    type="number"
                    value={form.precio_unitario}
                    onChange={(e) => setForm((f) => ({ ...f, precio_unitario: e.target.value }))}
                    step="0.01"
                    className={cx.input}
                    placeholder="Se usa el precio del producto si esta vacio"
                  />
                </div>

                {/* Discount */}
                <div>
                  <label className={cx.label}>Descuento</label>
                  <div className="flex gap-2">
                    <CustomSelect
                      value={descuentoTipo}
                      onChange={setDescuentoTipo}
                      options={[
                        { value: 'none', label: 'Sin descuento' },
                        { value: 'total', label: 'Monto fijo' },
                        { value: 'unit', label: 'Por unidad' },
                        { value: 'percent', label: 'Porcentaje' },
                      ]}
                      className="w-40"
                    />
                    {descuentoTipo !== 'none' && (
                      <input
                        type="number"
                        value={descuentoValor}
                        onChange={(e) => setDescuentoValor(e.target.value)}
                        className={cx.input + ' w-28'}
                        placeholder={descuentoTipo === 'percent' ? '10' : '5.00'}
                        min="0"
                        step="0.01"
                      />
                    )}
                  </div>
                  {descuentoTipo !== 'none' && calcDescuento() > 0 && (
                    <p className="text-[11px] text-stone-400 mt-1">
                      Descuento total: {formatCurrency(calcDescuento())}
                    </p>
                  )}
                </div>

                {/* Note */}
                <div>
                  <label className={cx.label}>Nota (opcional)</label>
                  <input
                    type="text"
                    value={form.nota}
                    onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Pedido delivery"
                  />
                </div>

                {/* Computed total */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <span className="text-sm text-stone-500">Total</span>
                  <span className="text-lg font-bold text-stone-900">{formatCurrency(formTotal)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button onClick={saveVenta} className={cx.btnPrimary + ' flex-1'}>
                  {editingVenta ? 'Guardar cambios' : 'Registrar'}
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
        title="Eliminar venta"
        message={`Estas seguro de eliminar esta venta de "${deleteTarget?.producto_nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// Summary card component
function SummaryCard({ icon, label, value, accent, positive }) {
  return (
    <div className={`${cx.card} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={accent ? 'text-[var(--accent)]' : 'text-stone-400'}>{icon}</span>
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <p className={`text-xl font-bold ${
        positive === false ? 'text-rose-600' : positive === true ? 'text-teal-700' : 'text-stone-900'
      }`}>
        {value}
      </p>
    </div>
  );
}
