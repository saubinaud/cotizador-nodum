import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomSelect from '../components/CustomSelect';
import { Plus, Save, X, Trash2, Pencil, Search, TrendingUp } from 'lucide-react';
import { useTerminos } from '../context/TerminosContext';

const UNIDADES = ['g', 'ml', 'uni', 'oz', 'kg', 'L'];

const emptyRow = () => ({
  id: null,
  nombre: '',
  cantidad_presentacion: '',
  unidad_medida: 'g',
  precio_presentacion: '',
  _editing: true,
  _new: true,
});

export default function InsumosPage() {
  const api = useApi();
  const toast = useToast();
  const t = useTerminos();
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);

  useEffect(() => {
    loadInsumos();
  }, []);

  const loadInsumos = async () => {
    try {
      const data = await api.get('/insumos');
      setInsumos((data.data || []).map((i) => ({
        ...i,
        cantidad_presentacion: parseFloat(i.cantidad_presentacion) || 0,
        precio_presentacion: parseFloat(i.precio_presentacion) || 0,
      })));
    } catch {
      toast.error('Error cargando insumos');
    } finally {
      setLoading(false);
    }
  };

  const addNew = () => {
    const row = emptyRow();
    setInsumos((prev) => [row, ...prev]);
    setEditingId('new');
    setEditData(row);
  };

  const startEdit = (ins) => {
    setEditingId(ins.id);
    setEditData({ ...ins });
  };

  const cancelEdit = () => {
    if (editingId === 'new') {
      setInsumos((prev) => prev.filter((i) => !i._new));
    }
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    const { nombre, cantidad_presentacion, unidad_medida, precio_presentacion } = editData;
    if (!nombre || !cantidad_presentacion || !precio_presentacion) {
      toast.error('Completa todos los campos');
      return;
    }

    try {
      if (editingId === 'new') {
        const data = await api.post('/insumos', {
          nombre,
          cantidad_presentacion: Number(cantidad_presentacion),
          unidad_medida,
          precio_presentacion: Number(precio_presentacion),
        });
        toast.success('Insumo creado');
        setInsumos((prev) => prev.map((i) => (i._new ? { ...(data.data), _editing: false } : i)));
      } else {
        const data = await api.put(`/insumos/${editingId}`, {
          nombre,
          cantidad_presentacion: Number(cantidad_presentacion),
          unidad_medida,
          precio_presentacion: Number(precio_presentacion),
        });
        if (data.recalculated?.length) {
          toast.success(`Insumo actualizado. ${data.recalculated.length} productos recalculados`);
        } else {
          toast.success('Insumo actualizado');
        }
        setInsumos((prev) => prev.map((i) => (i.id === editingId ? data.data : i)));
      }
      setEditingId(null);
      setEditData({});
      loadInsumos();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/insumos/${deleteTarget.id}`);
      toast.success('Insumo eliminado');
      setInsumos((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch {
      toast.error('Error eliminando insumo');
    } finally {
      setDeleteTarget(null);
    }
  };

  const loadPriceHistory = async (insumoId) => {
    try {
      const data = await api.get(`/pl/insumo-precios/${insumoId}`);
      setPriceHistory(data.data || null);
    } catch {
      toast.error('Error cargando historial');
    }
  };

  const costoUnitario = (ins) => {
    // Use WAC (costo_base) if available, otherwise calculate from catalog
    if (ins.costo_base && Number(ins.costo_base) > 0) return Number(ins.costo_base);
    const pres = Number(ins.cantidad_presentacion) || 0;
    const precio = Number(ins.precio_presentacion) || 0;
    if (pres === 0) return 0;
    return precio / pres;
  };

  const tieneWAC = (ins) => ins.costo_base && Number(ins.costo_base) > 0;

  const costoCatalogo = (ins) => {
    const pres = Number(ins.cantidad_presentacion) || 0;
    const precio = Number(ins.precio_presentacion) || 0;
    if (pres === 0) return 0;
    return precio / pres;
  };

  const filtered = insumos.filter(
    (i) =>
      i._new ||
      (i.nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={cx.skeleton + ' h-16'} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900">{t.insumos}</h2>
          <p className="text-stone-500 text-sm mt-0.5">{insumos.filter((i) => !i._new).length} insumos registrados</p>
        </div>
        <button onClick={addNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} />
          Nuevo Insumo
        </button>
      </div>

      {insumos.length > 0 && (
        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo..."
            className={cx.input + ' pl-9'}
          />
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {filtered.map((ins, idx) => {
          const isEditing = editingId === (ins._new ? 'new' : ins.id);
          if (isEditing) {
            return (
              <div key={ins.id || `new-${idx}`} className={`${cx.card} p-4 border-[var(--accent)] space-y-3`}>
                <input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} onBlur={(e) => { const v = e.target.value.trim(); if (v) setEditData({ ...editData, nombre: v.charAt(0).toUpperCase() + v.slice(1) }); }} placeholder="Nombre" className={cx.input} autoFocus />
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={editData.cantidad_presentacion} onChange={(e) => setEditData({ ...editData, cantidad_presentacion: e.target.value })} placeholder="Cantidad" className={cx.input} />
                  <CustomSelect
                    value={editData.unidad_medida}
                    onChange={(v) => setEditData({ ...editData, unidad_medida: v })}
                    options={UNIDADES.map(u => ({ value: u, label: u }))}
                  />
                  <input type="number" step="0.01" value={editData.precio_presentacion} onChange={(e) => setEditData({ ...editData, precio_presentacion: e.target.value })} placeholder="Precio" className={cx.input} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-1'}><Save size={14} /> Guardar</button>
                  <button onClick={cancelEdit} className={cx.btnSecondary + ' flex items-center justify-center gap-1'}><X size={14} /></button>
                </div>
              </div>
            );
          }
          return (
            <div key={ins.id} className={`${cx.card} p-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-stone-800 font-medium text-sm">{ins.nombre}</h3>
                  <p className="text-stone-500 text-xs mt-1">{ins.cantidad_presentacion} {ins.unidad_medida} - {formatCurrency(ins.precio_presentacion)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[var(--accent)] text-sm font-semibold">{formatCurrency(costoUnitario(ins))}/{ins.unidad_base || ins.unidad_medida}</span>
                  {tieneWAC(ins) && <p className="text-[10px] text-teal-600">WAC</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-3 border-t border-stone-200 pt-3">
                <button onClick={() => loadPriceHistory(ins.id)} className={cx.btnGhost + ' flex items-center justify-center gap-1'} title="Historial de precios"><TrendingUp size={13} /></button>
                <button onClick={() => startEdit(ins)} className={cx.btnGhost + ' flex-1 flex items-center justify-center gap-1'}><Pencil size={13} /> Editar</button>
                <button onClick={() => setDeleteTarget(ins)} className={cx.btnDanger + ' flex items-center justify-center gap-1'}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className={`${cx.card} hidden lg:block overflow-hidden`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-200">
              <th className={cx.th}>Nombre</th>
              <th className={cx.th}>Presentacion</th>
              <th className={cx.th}>Unidad</th>
              <th className={cx.th}>Precio</th>
              <th className={cx.th}>Costo Unitario</th>
              <th className={cx.th + ' text-right'}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ins, idx) => {
              const isEditing = editingId === (ins._new ? 'new' : ins.id);
              if (isEditing) {
                return (
                  <tr key={ins.id || `new-${idx}`} className="border-b border-[var(--accent)]/30">
                    <td className={cx.td}><input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} onBlur={(e) => { const v = e.target.value.trim(); if (v) setEditData({ ...editData, nombre: v.charAt(0).toUpperCase() + v.slice(1) }); }} className={cx.input} autoFocus /></td>
                    <td className={cx.td}><input type="number" value={editData.cantidad_presentacion} onChange={(e) => setEditData({ ...editData, cantidad_presentacion: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td}>
                      <CustomSelect
                        value={editData.unidad_medida}
                        onChange={(v) => setEditData({ ...editData, unidad_medida: v })}
                        options={UNIDADES.map(u => ({ value: u, label: u }))}
                      />
                    </td>
                    <td className={cx.td}><input type="number" step="0.01" value={editData.precio_presentacion} onChange={(e) => setEditData({ ...editData, precio_presentacion: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td + ' text-[var(--accent)] font-semibold'}>{formatCurrency(costoUnitario(editData))}</td>
                    <td className={cx.td + ' text-right'}>
                      <div className="flex justify-end gap-1">
                        <button onClick={saveEdit} className={cx.btnIcon + ' text-[var(--success)] hover:text-[var(--success)]'}><Save size={15} /></button>
                        <button onClick={cancelEdit} className={cx.btnIcon}><X size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={ins.id} className={cx.tr}>
                  <td className={cx.td + ' text-stone-800 font-medium'}>{ins.nombre}</td>
                  <td className={cx.td + ' text-stone-600'}>{ins.cantidad_presentacion}</td>
                  <td className={cx.td + ' text-stone-600'}>{ins.unidad_medida}</td>
                  <td className={cx.td + ' text-stone-600'}>{formatCurrency(ins.precio_presentacion)}</td>
                  <td className={cx.td + ' text-[var(--accent)] font-semibold'}>
                    {formatCurrency(costoUnitario(ins))}/{ins.unidad_base || ins.unidad_medida}
                    {tieneWAC(ins) && <span className="text-[10px] text-teal-600 ml-1">WAC</span>}
                  </td>
                  <td className={cx.td + ' text-right'}>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => loadPriceHistory(ins.id)} className={cx.btnIcon} title="Historial de precios"><TrendingUp size={15} /></button>
                      <button onClick={() => startEdit(ins)} className={cx.btnIcon}><Pencil size={15} /></button>
                      <button onClick={() => setDeleteTarget(ins)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Price history modal */}
      {priceHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPriceHistory(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-stone-900 mb-1">{priceHistory.insumo?.nombre}</h3>
            <p className="text-xs text-stone-400 mb-4">Historial de precios de compra</p>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-stone-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-stone-400 uppercase">WAC</p>
                <p className="text-sm font-bold text-stone-800">{formatCurrency(priceHistory.wac)}/{priceHistory.insumo?.unidad_base}</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-stone-400 uppercase">Ultimo</p>
                <p className="text-sm font-bold text-stone-800">{formatCurrency(priceHistory.ultimo_precio)}/{priceHistory.insumo?.unidad_base}</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-stone-400 uppercase">Rango</p>
                <p className="text-xs font-medium text-stone-600">{formatCurrency(priceHistory.precio_minimo)} - {formatCurrency(priceHistory.precio_maximo)}</p>
              </div>
            </div>

            {/* History table */}
            {priceHistory.num_compras > 0 && (
              <div className="border border-stone-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-stone-50">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Fecha</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cant.</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Precio</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Costo/base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.historial.map((h, i) => (
                      <tr key={i} className="border-t border-stone-50">
                        <td className="px-3 py-2 text-stone-600">{formatDate(h.fecha)}</td>
                        <td className="px-3 py-2 text-center text-stone-500">{parseFloat(h.cantidad)}</td>
                        <td className="px-3 py-2 text-right text-stone-800">{formatCurrency(h.precio_total)}</td>
                        <td className="px-3 py-2 text-right font-medium text-stone-800">{Number(h.costo_por_base).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {priceHistory.num_compras === 0 && (
              <p className="text-center text-stone-400 text-sm py-8">Sin historial de compras</p>
            )}

            <button onClick={() => setPriceHistory(null)} className={cx.btnSecondary + ' w-full mt-4'}>Cerrar</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar insumo"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
