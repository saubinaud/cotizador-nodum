import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Save, Trash2, Pencil } from 'lucide-react';

let tmpId = 0;
const newId = () => `tmp-${++tmpId}`;

export default function EmpaquePredPage() {
  const api = useApi();
  const toast = useToast();

  const [empaques, setEmpaques] = useState([]);
  const [catalogMateriales, setCatalogMateriales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadEmpaques();
    api.get('/materiales').then((d) => setCatalogMateriales(d.data || [])).catch(() => {});
  }, []);

  const loadEmpaques = async () => {
    try {
      const data = await api.get('/predeterminados/empaques');
      setEmpaques(data.data || []);
    } catch {
      toast.error('Error cargando empaques');
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setEditingId('new');
    setEditData({
      nombre: '',
      materiales: [{ _id: newId(), material_id: null, nombre: '', cantidad: '1', precio: 0 }],
    });
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setEditData({
      nombre: emp.nombre,
      materiales: (emp.materiales || []).map((m) => ({ ...m, _id: newId() })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const addMaterial = () => {
    setEditData((prev) => ({
      ...prev,
      materiales: [...prev.materiales, { _id: newId(), material_id: null, nombre: '', cantidad: '1', precio: 0 }],
    }));
  };

  const removeMaterial = (mid) => {
    setEditData((prev) => ({ ...prev, materiales: prev.materiales.filter((m) => m._id !== mid) }));
  };

  const selectMaterial = (mid, cat) => {
    setEditData((prev) => ({
      ...prev,
      materiales: prev.materiales.map((m) =>
        m._id === mid ? { ...m, material_id: cat.id, nombre: cat.nombre, precio: Number(cat.cantidad_presentacion) > 0 ? Number(cat.precio_presentacion) / Number(cat.cantidad_presentacion) : Number(cat.precio_presentacion) || 0 } : m
      ),
    }));
  };

  const updateMaterial = (mid, field, val) => {
    setEditData((prev) => ({
      ...prev,
      materiales: prev.materiales.map((m) => (m._id === mid ? { ...m, [field]: val } : m)),
    }));
  };

  const save = async () => {
    if (!editData.nombre) {
      toast.error('Nombre requerido');
      return;
    }
    const payload = {
      nombre: editData.nombre,
      materiales: editData.materiales.filter((m) => m.material_id).map((m) => ({ material_id: m.material_id, cantidad: Number(m.cantidad) || 1 })),
    };
    try {
      if (editingId === 'new') {
        await api.post('/predeterminados/empaques', payload);
        toast.success('Empaque creado');
      } else {
        await api.put(`/predeterminados/empaques/${editingId}`, payload);
        toast.success('Empaque actualizado');
      }
      cancelEdit();
      loadEmpaques();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/predeterminados/empaques/${deleteTarget.id}`);
      toast.success('Empaque eliminado');
      setEmpaques((prev) => prev.filter((e) => e.id !== deleteTarget.id));
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
          <h2 className="text-xl font-bold text-white">Empaques Predeterminados</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{empaques.length} empaques</p>
        </div>
        <button onClick={startNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} /> Nuevo Empaque
        </button>
      </div>

      {editData && (
        <div className={`${cx.card} p-5 mb-6 border-[#FA7B21]`}>
          <div className="mb-4">
            <label className={cx.label}>Nombre del empaque</label>
            <input type="text" value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} className={cx.input} autoFocus />
          </div>

          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Materiales</h4>
          <div className="space-y-2 mb-3">
            {editData.materiales.map((mat) => (
              <div key={mat._id} className="flex gap-2 items-center">
                <div className="flex-1">
                  <SearchableSelect
                    options={catalogMateriales}
                    value={mat.material_id}
                    onChange={(item) => selectMaterial(mat._id, item)}
                    placeholder="Seleccionar material..."
                  />
                </div>
                <input
                  type="number"
                  value={mat.cantidad}
                  onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                  placeholder="Cant."
                  className="w-20 bg-zinc-800 rounded-lg px-2 py-2.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                />
                <span className="text-zinc-500 text-xs w-20 text-right">
                  {formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}
                </span>
                <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addMaterial} className={cx.btnGhost + ' text-xs flex items-center gap-1 mb-4'}>
            <Plus size={13} /> Agregar Material
          </button>

          <div className="flex gap-2">
            <button onClick={save} className={cx.btnPrimary + ' flex items-center gap-1'}><Save size={14} /> Guardar</button>
            <button onClick={cancelEdit} className={cx.btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {empaques.map((emp) => (
          <div key={emp.id} className={`${cx.card} p-4`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-white font-medium text-sm">{emp.nombre}</h3>
                <p className="text-zinc-500 text-xs mt-1">{(emp.materiales || []).length} materiales</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(emp)} className={cx.btnIcon}><Pencil size={15} /></button>
                <button onClick={() => setDeleteTarget(emp)} className={cx.btnIcon + ' hover:text-red-400'}><Trash2 size={15} /></button>
              </div>
            </div>
            {(emp.materiales || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                {emp.materiales.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-zinc-400">{m.nombre || `Material #${m.material_id}`}</span>
                    <span className="text-zinc-500">x{m.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar empaque"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
