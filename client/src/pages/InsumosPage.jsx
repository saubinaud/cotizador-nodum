import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomSelect from '../components/CustomSelect';
import { Plus, Save, X, Trash2, Pencil, Search } from 'lucide-react';

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
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const costoUnitario = (ins) => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-stone-800">Insumos</h2>
          <p className="text-stone-400 text-sm mt-0.5">{insumos.filter((i) => !i._new).length} insumos registrados</p>
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
                  <p className="text-stone-400 text-xs mt-1">{ins.cantidad_presentacion} {ins.unidad_medida} - {formatCurrency(ins.precio_presentacion)}</p>
                </div>
                <span className="text-[var(--accent)] text-sm font-semibold">{formatCurrency(costoUnitario(ins))}/{ins.unidad_medida}</span>
              </div>
              <div className="flex gap-2 mt-3 border-t border-stone-200 pt-3">
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
                  <td className={cx.td + ' text-[var(--accent)] font-semibold'}>{formatCurrency(costoUnitario(ins))}/{ins.unidad_medida}</td>
                  <td className={cx.td + ' text-right'}>
                    <div className="flex justify-end gap-1">
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
