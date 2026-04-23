import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Save, X, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

let tmpId = 0;
const newId = () => `tmp-${++tmpId}`;

export default function PrepPredPage() {
  const api = useApi();
  const toast = useToast();

  const [preps, setPreps] = useState([]);
  const [catalogInsumos, setCatalogInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadPreps();
    api.get('/insumos').then((d) => setCatalogInsumos(d.data || [])).catch(() => {});
  }, []);

  const loadPreps = async () => {
    try {
      const data = await api.get('/predeterminados/preparaciones');
      setPreps(data.data || []);
    } catch {
      toast.error('Error cargando preparaciones');
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setEditingId('new');
    setEditData({ nombre: '', capacidad: '', unidad: '', insumos: [{ _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0 }] });
  };

  const startEdit = (prep) => {
    setEditingId(prep.id);
    setEditData({
      nombre: prep.nombre,
      capacidad: prep.capacidad || '',
      unidad: prep.unidad || '',
      insumos: (prep.insumos || []).map((i) => ({ ...i, _id: newId() })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const addInsumo = () => {
    setEditData((prev) => ({
      ...prev,
      insumos: [...prev.insumos, { _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0 }],
    }));
  };

  const removeInsumo = (iid) => {
    setEditData((prev) => ({ ...prev, insumos: prev.insumos.filter((i) => i._id !== iid) }));
  };

  const selectInsumo = (iid, cat) => {
    const costoUnit = Number(cat.cantidad_presentacion) > 0 ? Number(cat.precio_presentacion) / Number(cat.cantidad_presentacion) : Number(cat.precio_presentacion);
    setEditData((prev) => ({
      ...prev,
      insumos: prev.insumos.map((i) =>
        i._id === iid ? { ...i, insumo_id: cat.id, nombre: cat.nombre, costo_unitario: costoUnit } : i
      ),
    }));
  };

  const updateInsumo = (iid, field, val) => {
    setEditData((prev) => ({
      ...prev,
      insumos: prev.insumos.map((i) => (i._id === iid ? { ...i, [field]: val } : i)),
    }));
  };

  const save = async () => {
    if (!editData.nombre) {
      toast.error('Nombre requerido');
      return;
    }
    const payload = {
      nombre: editData.nombre,
      capacidad: editData.capacidad,
      unidad: editData.unidad,
      insumos: editData.insumos.filter((i) => i.insumo_id).map((i) => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) || 0 })),
    };
    try {
      if (editingId === 'new') {
        await api.post('/predeterminados/preparaciones', payload);
        toast.success('Preparacion creada');
      } else {
        await api.put(`/predeterminados/preparaciones/${editingId}`, payload);
        toast.success('Preparacion actualizada');
      }
      cancelEdit();
      loadPreps();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/predeterminados/preparaciones/${deleteTarget.id}`);
      toast.success('Preparacion eliminada');
      setPreps((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-20'} />)}</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Preparaciones Predeterminadas</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{preps.length} preparaciones</p>
        </div>
        <button onClick={startNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} /> Nueva Preparacion
        </button>
      </div>

      {/* Edit/create form */}
      {editData && (
        <div className={`${cx.card} p-5 mb-6 border-[#FA7B21]`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className={cx.label}>Nombre</label>
              <input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} className={cx.input} autoFocus />
            </div>
            <div>
              <label className={cx.label}>Capacidad</label>
              <input type="number" value={editData.capacidad} onChange={(e) => setEditData({ ...editData, capacidad: e.target.value })} className={cx.input} />
            </div>
            <div>
              <label className={cx.label}>Unidad</label>
              <input type="text" value={editData.unidad} onChange={(e) => setEditData({ ...editData, unidad: e.target.value })} className={cx.input} />
            </div>
          </div>

          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Insumos</h4>
          <div className="space-y-2 mb-3">
            {editData.insumos.map((ins) => (
              <div key={ins._id} className="flex gap-2 items-center">
                <div className="flex-1">
                  <SearchableSelect
                    options={catalogInsumos}
                    value={ins.insumo_id}
                    onChange={(item) => selectInsumo(ins._id, item)}
                    placeholder="Seleccionar insumo..."
                  />
                </div>
                <input
                  type="number"
                  value={ins.cantidad}
                  onChange={(e) => updateInsumo(ins._id, 'cantidad', e.target.value)}
                  placeholder="Cantidad"
                  className="w-24 bg-zinc-800 rounded-lg px-2 py-2.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                />
                <span className="text-zinc-500 text-xs w-20 text-right">
                  {formatCurrency((Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0))}
                </span>
                <button onClick={() => removeInsumo(ins._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addInsumo} className={cx.btnGhost + ' text-xs flex items-center gap-1 mb-4'}>
            <Plus size={13} /> Agregar Insumo
          </button>

          <div className="flex gap-2">
            <button onClick={save} className={cx.btnPrimary + ' flex items-center gap-1'}><Save size={14} /> Guardar</button>
            <button onClick={cancelEdit} className={cx.btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {preps.map((prep) => (
          <div key={prep.id} className={`${cx.card} p-4`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-white font-medium text-sm">{prep.nombre}</h3>
                <p className="text-zinc-500 text-xs mt-1">
                  {prep.capacidad && `${prep.capacidad} ${prep.unidad || ''} - `}
                  {(prep.insumos || []).length} insumos
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(prep)} className={cx.btnIcon}><Pencil size={15} /></button>
                <button onClick={() => setDeleteTarget(prep)} className={cx.btnIcon + ' hover:text-red-400'}><Trash2 size={15} /></button>
              </div>
            </div>
            {(prep.insumos || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                {prep.insumos.map((ins, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-zinc-400">{ins.nombre || `Insumo #${ins.insumo_id}`}</span>
                    <span className="text-zinc-500">x{ins.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar preparacion"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
