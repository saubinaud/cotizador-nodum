import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, Pencil, ChevronDown, ChevronUp,
  DollarSign, TrendingDown, Wallet, Copy, Settings,
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

export default function PLGastosPage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [categorias, setCategorias] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingGastos, setLoadingGastos] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);
  const [copyingRecurrentes, setCopyingRecurrentes] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ nombre: '', tipo: 'fijo', recurrente: false, monto_default: '' });
  const [editingCat, setEditingCat] = useState(null);

  // Modal form
  const [form, setForm] = useState({
    categoria_id: null,
    fecha: todayStr(),
    monto: '',
    descripcion: '',
  });

  // Load periodos + categorias on mount
  useEffect(() => {
    Promise.all([
      api.get('/pl/periodos').catch(() => ({ data: [] })),
      api.get('/pl/categorias').catch(() => ({ data: [] })),
    ]).then(([perRes, catRes]) => {
      const pers = perRes.data || [];
      setPeriodos(pers);
      setCategorias(catRes.data || []);
      if (pers.length > 0) {
        setPeriodoId(pers[0].id);
      }
      setLoading(false);
    });
  }, []);

  // Load gastos + resumen when periodo changes
  const loadGastos = async (pid) => {
    if (!pid) return;
    setLoadingGastos(true);
    try {
      const [gastosRes, resumenRes] = await Promise.all([
        api.get(`/pl/gastos?periodo_id=${pid}`),
        api.get(`/pl/gastos/resumen?periodo_id=${pid}`),
      ]);
      setGastos(gastosRes.data || []);
      setResumen(resumenRes.data || null);
    } catch {
      toast.error('Error cargando gastos');
    } finally {
      setLoadingGastos(false);
    }
  };

  useEffect(() => {
    if (periodoId) loadGastos(periodoId);
  }, [periodoId]); // eslint-disable-line

  // Reload categorias
  const reloadCategorias = async () => {
    try {
      const res = await api.get('/pl/categorias');
      setCategorias(res.data || []);
    } catch { /* silent */ }
  };

  // Period options for CustomSelect
  const periodoOptions = useMemo(() =>
    periodos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [periodos]
  );

  // Category options for CustomSelect
  const categoriaOptions = useMemo(() =>
    categorias.map((c) => ({ value: String(c.id), label: `${c.nombre} (${c.tipo})` })),
    [categorias]
  );

  // Group gastos by category
  const gastosByCategory = useMemo(() => {
    if (!resumen?.categorias) return [];
    return resumen.categorias.map((cat) => ({
      ...cat,
      gastos: gastos.filter((g) => g.categoria_id === cat.categoria_id),
    }));
  }, [resumen, gastos]);

  // Create first period
  const crearPrimerPeriodo = async () => {
    setCreatingPeriodo(true);
    try {
      const mp = currentMonthPeriod();
      const res = await api.post('/pl/periodos', mp);
      const nuevo = res.data;
      setPeriodos([nuevo]);
      setPeriodoId(nuevo.id);
      // Reload categorias (seed happens on first period creation)
      await reloadCategorias();
      toast.success('Periodo creado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingPeriodo(false);
    }
  };

  // Copy recurring expenses
  const copiarRecurrentes = async () => {
    setCopyingRecurrentes(true);
    try {
      const res = await api.post('/pl/gastos/copiar-recurrentes', { periodo_id: periodoId });
      const { copied, source } = res.data;
      if (copied === 0) {
        toast.info('No hay gastos recurrentes para copiar');
      } else {
        toast.success(`${copied} gasto(s) recurrente(s) copiado(s) (${source === 'defaults' ? 'valores por defecto' : 'periodo anterior'})`);
      }
      loadGastos(periodoId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCopyingRecurrentes(false);
    }
  };

  // Open modal for new gasto
  const openNewGasto = () => {
    setEditingGasto(null);
    setForm({
      categoria_id: null,
      fecha: todayStr(),
      monto: '',
      descripcion: '',
    });
    setModalOpen(true);
  };

  // Open modal for editing
  const openEditGasto = (g) => {
    setEditingGasto(g);
    setForm({
      categoria_id: g.categoria_id,
      fecha: g.fecha ? g.fecha.slice(0, 10) : todayStr(),
      monto: parseFloat(g.monto) || '',
      descripcion: g.descripcion || '',
    });
    setModalOpen(true);
  };

  // Save gasto
  const saveGasto = async () => {
    if (!form.categoria_id || !form.fecha || !form.monto) {
      toast.error('Categoria, fecha y monto son requeridos');
      return;
    }
    try {
      if (editingGasto) {
        await api.put(`/pl/gastos/${editingGasto.id}`, {
          categoria_id: form.categoria_id,
          monto: form.monto,
          descripcion: form.descripcion,
        });
        toast.success('Gasto actualizado');
      } else {
        await api.post('/pl/gastos', {
          periodo_id: periodoId,
          categoria_id: form.categoria_id,
          fecha: form.fecha,
          monto: form.monto,
          descripcion: form.descripcion,
        });
        toast.success('Gasto registrado');
      }
      setModalOpen(false);
      loadGastos(periodoId);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Delete gasto
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/pl/gastos/${deleteTarget.id}`);
      toast.success('Gasto eliminado');
      loadGastos(periodoId);
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Category management
  const openNewCat = () => {
    setEditingCat(null);
    setCatForm({ nombre: '', tipo: 'fijo', recurrente: false, monto_default: '' });
    setCatModalOpen(true);
  };

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({
      nombre: cat.nombre,
      tipo: cat.tipo,
      recurrente: cat.recurrente,
      monto_default: cat.monto_default ? parseFloat(cat.monto_default) : '',
    });
    setCatModalOpen(true);
  };

  const saveCat = async () => {
    if (!catForm.nombre.trim()) {
      toast.error('Nombre requerido');
      return;
    }
    try {
      if (editingCat) {
        await api.put(`/pl/categorias/${editingCat.id}`, {
          nombre: catForm.nombre,
          tipo: catForm.tipo,
          recurrente: catForm.recurrente,
          monto_default: catForm.monto_default || null,
        });
        toast.success('Categoria actualizada');
      } else {
        await api.post('/pl/categorias', {
          nombre: catForm.nombre,
          tipo: catForm.tipo,
          recurrente: catForm.recurrente,
          monto_default: catForm.monto_default || null,
        });
        toast.success('Categoria creada');
      }
      setCatModalOpen(false);
      await reloadCategorias();
      if (periodoId) loadGastos(periodoId);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deactivateCat = async (cat) => {
    try {
      await api.put(`/pl/categorias/${cat.id}`, { activa: false });
      toast.success('Categoria desactivada');
      await reloadCategorias();
      if (periodoId) loadGastos(periodoId);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Toggle accordion
  const toggleCategory = (catId) => {
    setExpanded((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

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

  // No periods yet
  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-2xl font-bold text-stone-900 mb-8">Gastos</h1>
        <div className={`${cx.card} p-12 text-center`}>
          <Wallet size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-sm mb-6">
            Para registrar gastos, primero necesitas crear un periodo contable.
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Gastos</h1>
          <CustomSelect
            value={String(periodoId)}
            onChange={(v) => setPeriodoId(parseInt(v))}
            options={periodoOptions}
            placeholder="Periodo"
            className="w-48"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copiarRecurrentes}
            disabled={copyingRecurrentes}
            className={cx.btnSecondary + ' flex items-center gap-2 text-xs sm:text-sm'}
          >
            <Copy size={14} /> {copyingRecurrentes ? 'Copiando...' : 'Copiar recurrentes'}
          </button>
          <button onClick={openNewGasto} className={cx.btnPrimary + ' flex items-center gap-2'}>
            <Plus size={14} /> Registrar gasto
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            icon={<DollarSign size={18} />}
            label="Gastos fijos"
            value={formatCurrency(resumen.total_fijos)}
            color="text-blue-600"
          />
          <SummaryCard
            icon={<TrendingDown size={18} />}
            label="Gastos variables"
            value={formatCurrency(resumen.total_variables)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={<Wallet size={18} />}
            label="Total gastos"
            value={formatCurrency(resumen.total)}
            color="text-rose-600"
            bold
          />
        </div>
      )}

      {/* Category management link */}
      <div className="flex justify-end mb-3">
        <button onClick={openNewCat} className={cx.btnGhost + ' flex items-center gap-1 text-xs'}>
          <Settings size={12} /> Gestionar categorias
        </button>
      </div>

      {/* Gastos grouped by category — accordion */}
      {loadingGastos ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : gastosByCategory.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <p className="text-stone-400 text-sm">No hay categorias de gasto configuradas</p>
        </div>
      ) : (
        <div className={`${cx.card} divide-y divide-stone-100 overflow-hidden`}>
          {gastosByCategory.map((cat) => {
            const isExpanded = expanded[cat.categoria_id] === true;
            const catTotal = parseFloat(cat.total) || 0;
            const hasTotals = catTotal > 0;
            return (
              <div key={cat.categoria_id}>
                {/* Category header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-stone-50/50 transition-colors"
                  onClick={() => toggleCategory(cat.categoria_id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded
                      ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                    }
                    <span className="text-sm font-semibold text-stone-900 truncate">{cat.categoria_nombre}</span>
                    <span className={cx.badge(
                      cat.categoria_tipo === 'fijo' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                    )}>
                      {cat.categoria_tipo}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${hasTotals ? 'text-stone-900' : 'text-stone-300'}`}>
                    {formatCurrency(catTotal)}
                  </span>
                </div>

                {/* Expanded: list of gastos */}
                {isExpanded && (
                  <div className="px-5 pb-4">
                    {cat.gastos.length === 0 ? (
                      <p className="text-stone-400 text-xs py-2 pl-7">Sin gastos en esta categoria</p>
                    ) : (
                      <>
                        {/* Desktop view */}
                        <div className="hidden lg:block">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-stone-100">
                                <th className={cx.th}>Fecha</th>
                                <th className={cx.th}>Descripcion</th>
                                <th className={cx.th + ' text-right'}>Monto</th>
                                <th className={cx.th + ' w-20'}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {cat.gastos.map((g) => (
                                <tr key={g.id} className={cx.tr}>
                                  <td className={cx.td + ' text-stone-600'}>{formatDate(g.fecha)}</td>
                                  <td className={cx.td + ' text-stone-800'}>{g.descripcion || '-'}</td>
                                  <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(g.monto)}</td>
                                  <td className={cx.td}>
                                    <div className="flex items-center gap-1 justify-end">
                                      <button onClick={(e) => { e.stopPropagation(); openEditGasto(g); }} className={cx.btnIcon}><Pencil size={14} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile view: cards */}
                        <div className="lg:hidden space-y-2">
                          {cat.gastos.map((g) => (
                            <div key={g.id} className="flex items-center justify-between py-2 pl-7">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-stone-800 truncate">{g.descripcion || 'Sin descripcion'}</p>
                                <p className="text-[11px] text-stone-400">{formatDate(g.fecha)}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                <span className="text-sm font-semibold text-stone-900">{formatCurrency(g.monto)}</span>
                                <button onClick={(e) => { e.stopPropagation(); openEditGasto(g); }} className={cx.btnIcon + ' !p-1'}><Pencil size={12} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }} className={cx.btnIcon + ' !p-1 hover:text-rose-600'}><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Register/Edit Gasto Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-stone-900">
                  {editingGasto ? 'Editar gasto' : 'Registrar gasto'}
                </h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Category */}
                <div>
                  <label className={cx.label}>Categoria</label>
                  <CustomSelect
                    value={form.categoria_id ? String(form.categoria_id) : ''}
                    onChange={(v) => setForm((f) => ({ ...f, categoria_id: parseInt(v) }))}
                    options={categoriaOptions}
                    placeholder="Seleccionar categoria..."
                  />
                </div>

                {/* Date (only for new) */}
                {!editingGasto && (
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

                {/* Amount */}
                <div>
                  <label className={cx.label}>Monto</label>
                  <input
                    type="number"
                    value={form.monto}
                    onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                    step="0.01"
                    min="0"
                    className={cx.input}
                    placeholder="0.00"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={cx.label}>Descripcion (opcional)</label>
                  <input
                    type="text"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Pago mensual de alquiler"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button onClick={saveGasto} className={cx.btnPrimary + ' flex-1'}>
                  {editingGasto ? 'Guardar cambios' : 'Registrar'}
                </button>
                <button onClick={() => setModalOpen(false)} className={cx.btnSecondary}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCatModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-stone-900">Gestionar categorias</h3>
                <button onClick={() => setCatModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              {/* Existing categories list */}
              {categorias.length > 0 && (
                <div className="mb-6 divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
                  {categorias.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-stone-800 truncate">{cat.nombre}</span>
                        <span className={cx.badge(
                          cat.tipo === 'fijo' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                        )}>
                          {cat.tipo}
                        </span>
                        {cat.recurrente && (
                          <span className={cx.badge('bg-teal-50 text-teal-600')}>recurrente</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditCat(cat)} className={cx.btnIcon + ' !p-1'}><Pencil size={12} /></button>
                        <button onClick={() => deactivateCat(cat)} className={cx.btnIcon + ' !p-1 hover:text-rose-600'}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add/edit category form */}
              <div className="border-t border-stone-100 pt-4">
                <p className="text-xs font-semibold text-stone-500 tracking-wide mb-3">
                  {editingCat ? 'EDITAR CATEGORIA' : 'NUEVA CATEGORIA'}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className={cx.label}>Nombre</label>
                    <input
                      type="text"
                      value={catForm.nombre}
                      onChange={(e) => setCatForm((f) => ({ ...f, nombre: e.target.value }))}
                      className={cx.input}
                      placeholder="Ej: Alquiler"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={cx.label}>Tipo</label>
                      <CustomSelect
                        value={catForm.tipo}
                        onChange={(v) => setCatForm((f) => ({ ...f, tipo: v }))}
                        options={[
                          { value: 'fijo', label: 'Fijo' },
                          { value: 'variable', label: 'Variable' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className={cx.label}>Monto por defecto</label>
                      <input
                        type="number"
                        value={catForm.monto_default}
                        onChange={(e) => setCatForm((f) => ({ ...f, monto_default: e.target.value }))}
                        step="0.01"
                        className={cx.input}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catForm.recurrente}
                      onChange={(e) => setCatForm((f) => ({ ...f, recurrente: e.target.checked }))}
                      className="rounded border-stone-300 text-[var(--accent)] focus:ring-0"
                    />
                    <span className="text-sm text-stone-700">Gasto recurrente (se copia mes a mes)</span>
                  </label>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={saveCat} className={cx.btnPrimary + ' flex-1'}>
                    {editingCat ? 'Guardar' : 'Crear categoria'}
                  </button>
                  {editingCat && (
                    <button onClick={() => { setEditingCat(null); setCatForm({ nombre: '', tipo: 'fijo', recurrente: false, monto_default: '' }); }} className={cx.btnSecondary}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar gasto"
        message={`Estas seguro de eliminar este gasto de ${formatCurrency(deleteTarget?.monto)}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// Summary card component
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
