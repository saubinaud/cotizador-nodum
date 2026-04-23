import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Save, X, Trash2, Pencil, Search } from 'lucide-react';

const UNIDADES = ['uni', 'g', 'ml', 'oz', 'kg', 'l', 'mt', 'cm'];

const emptyRow = () => ({
  id: null,
  nombre: '',
  proveedor: '',
  detalle: '',
  presentacion: '',
  unidad: 'uni',
  precio: '',
  _editing: true,
  _new: true,
});

export default function MaterialesPage() {
  const api = useApi();
  const toast = useToast();
  const [materiales, setMateriales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadMateriales();
  }, []);

  const loadMateriales = async () => {
    try {
      const data = await api.get('/materiales');
      setMateriales(data.materiales || data || []);
    } catch {
      toast.error('Error cargando materiales');
    } finally {
      setLoading(false);
    }
  };

  const addNew = () => {
    const row = emptyRow();
    setMateriales((prev) => [row, ...prev]);
    setEditingId('new');
    setEditData(row);
  };

  const startEdit = (mat) => {
    setEditingId(mat.id);
    setEditData({ ...mat });
  };

  const cancelEdit = () => {
    if (editingId === 'new') {
      setMateriales((prev) => prev.filter((i) => !i._new));
    }
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    const { nombre, proveedor, detalle, presentacion, unidad, precio } = editData;
    if (!nombre || !precio) {
      toast.error('Nombre y precio son obligatorios');
      return;
    }
    try {
      if (editingId === 'new') {
        await api.post('/materiales', { nombre, proveedor, detalle, presentacion, unidad, precio: Number(precio) });
        toast.success('Material creado');
      } else {
        const data = await api.put(`/materiales/${editingId}`, { nombre, proveedor, detalle, presentacion, unidad, precio: Number(precio) });
        if (data.productos_afectados) {
          toast.success(`Material actualizado. ${data.productos_afectados} productos recalculados`);
        } else {
          toast.success('Material actualizado');
        }
      }
      setEditingId(null);
      setEditData({});
      loadMateriales();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/materiales/${deleteTarget.id}`);
      toast.success('Material eliminado');
      setMateriales((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch {
      toast.error('Error eliminando material');
    } finally {
      setDeleteTarget(null);
    }
  };

  const costoUnitario = (m) => {
    const pres = Number(m.presentacion) || 1;
    const precio = Number(m.precio) || 0;
    return precio / pres;
  };

  const filtered = materiales.filter(
    (i) => i._new || (i.nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Materiales</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{materiales.filter((m) => !m._new).length} materiales registrados</p>
        </div>
        <button onClick={addNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} /> Nuevo Material
        </button>
      </div>

      {materiales.length > 0 && (
        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar material..." className={cx.input + ' pl-9'} />
        </div>
      )}

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {filtered.map((mat, idx) => {
          const isEditing = editingId === (mat._new ? 'new' : mat.id);
          if (isEditing) {
            return (
              <div key={mat.id || `new-${idx}`} className={`${cx.card} p-4 border-[#FA7B21] space-y-3`}>
                <input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} placeholder="Nombre" className={cx.input} autoFocus />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={editData.proveedor || ''} onChange={(e) => setEditData({ ...editData, proveedor: e.target.value })} placeholder="Proveedor" className={cx.input} />
                  <input type="text" value={editData.detalle || ''} onChange={(e) => setEditData({ ...editData, detalle: e.target.value })} placeholder="Detalle" className={cx.input} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={editData.presentacion} onChange={(e) => setEditData({ ...editData, presentacion: e.target.value })} placeholder="Presentacion" className={cx.input} />
                  <select value={editData.unidad} onChange={(e) => setEditData({ ...editData, unidad: e.target.value })} className={cx.select}>
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" step="0.01" value={editData.precio} onChange={(e) => setEditData({ ...editData, precio: e.target.value })} placeholder="Precio" className={cx.input} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-1'}><Save size={14} /> Guardar</button>
                  <button onClick={cancelEdit} className={cx.btnSecondary + ' flex items-center justify-center gap-1'}><X size={14} /></button>
                </div>
              </div>
            );
          }
          return (
            <div key={mat.id} className={`${cx.card} p-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-white font-medium text-sm">{mat.nombre}</h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    {mat.proveedor && <span>{mat.proveedor} - </span>}
                    {mat.presentacion} {mat.unidad} - {formatCurrency(mat.precio)}
                  </p>
                  {mat.detalle && <p className="text-zinc-600 text-xs mt-0.5">{mat.detalle}</p>}
                </div>
                <span className="text-[#FA7B21] text-sm font-semibold">{formatCurrency(costoUnitario(mat))}/{mat.unidad}</span>
              </div>
              <div className="flex gap-2 mt-3 border-t border-zinc-800 pt-3">
                <button onClick={() => startEdit(mat)} className={cx.btnGhost + ' flex-1 flex items-center justify-center gap-1'}><Pencil size={13} /> Editar</button>
                <button onClick={() => setDeleteTarget(mat)} className={cx.btnDanger + ' flex items-center justify-center gap-1'}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className={`${cx.card} hidden lg:block overflow-hidden`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className={cx.th}>Nombre</th>
              <th className={cx.th}>Proveedor</th>
              <th className={cx.th}>Detalle</th>
              <th className={cx.th}>Presentacion</th>
              <th className={cx.th}>Unidad</th>
              <th className={cx.th}>Precio</th>
              <th className={cx.th}>Costo Unit.</th>
              <th className={cx.th + ' text-right'}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((mat, idx) => {
              const isEditing = editingId === (mat._new ? 'new' : mat.id);
              if (isEditing) {
                return (
                  <tr key={mat.id || `new-${idx}`} className="border-b border-[#FA7B21]/30">
                    <td className={cx.td}><input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} className={cx.input} autoFocus /></td>
                    <td className={cx.td}><input type="text" value={editData.proveedor || ''} onChange={(e) => setEditData({ ...editData, proveedor: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td}><input type="text" value={editData.detalle || ''} onChange={(e) => setEditData({ ...editData, detalle: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td}><input type="number" value={editData.presentacion} onChange={(e) => setEditData({ ...editData, presentacion: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td}>
                      <select value={editData.unidad} onChange={(e) => setEditData({ ...editData, unidad: e.target.value })} className={cx.select}>
                        {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className={cx.td}><input type="number" step="0.01" value={editData.precio} onChange={(e) => setEditData({ ...editData, precio: e.target.value })} className={cx.input} /></td>
                    <td className={cx.td + ' text-[#FA7B21] font-semibold'}>{formatCurrency(costoUnitario(editData))}</td>
                    <td className={cx.td + ' text-right'}>
                      <div className="flex justify-end gap-1">
                        <button onClick={saveEdit} className={cx.btnIcon + ' text-green-400 hover:text-green-300'}><Save size={15} /></button>
                        <button onClick={cancelEdit} className={cx.btnIcon}><X size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={mat.id} className={cx.tr}>
                  <td className={cx.td + ' text-white font-medium'}>{mat.nombre}</td>
                  <td className={cx.td + ' text-zinc-400'}>{mat.proveedor || '-'}</td>
                  <td className={cx.td + ' text-zinc-400'}>{mat.detalle || '-'}</td>
                  <td className={cx.td + ' text-zinc-300'}>{mat.presentacion}</td>
                  <td className={cx.td + ' text-zinc-300'}>{mat.unidad}</td>
                  <td className={cx.td + ' text-zinc-300'}>{formatCurrency(mat.precio)}</td>
                  <td className={cx.td + ' text-[#FA7B21] font-semibold'}>{formatCurrency(costoUnitario(mat))}/{mat.unidad}</td>
                  <td className={cx.td + ' text-right'}>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => startEdit(mat)} className={cx.btnIcon}><Pencil size={15} /></button>
                      <button onClick={() => setDeleteTarget(mat)} className={cx.btnIcon + ' hover:text-red-400'}><Trash2 size={15} /></button>
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
        title="Eliminar material"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
