import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Save, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [collapsed, setCollapsed] = useState({});

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
      materiales: [{ _id: newId(), material_id: null, nombre: '', cantidad: '1', precio: 0, unidad_medida: '' }],
    });
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setEditData({
      nombre: emp.nombre,
      materiales: (emp.materiales || []).map((m) => {
        const precio = Number(m.cantidad_presentacion) > 0
          ? Number(m.precio_presentacion) / Number(m.cantidad_presentacion)
          : Number(m.precio) || 0;
        return {
          ...m,
          _id: newId(),
          cantidad: parseFloat(m.cantidad) || 1,
          precio,
          unidad_medida: m.unidad_medida || '',
        };
      }),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const addMaterial = () => {
    setEditData((prev) => ({
      ...prev,
      materiales: [...prev.materiales, { _id: newId(), material_id: null, nombre: '', cantidad: '1', precio: 0, unidad_medida: '' }],
    }));
  };

  const removeMaterial = (mid) => {
    setEditData((prev) => ({ ...prev, materiales: prev.materiales.filter((m) => m._id !== mid) }));
  };

  const selectMaterial = (mid, cat) => {
    const precio = Number(cat.cantidad_presentacion) > 0
      ? Number(cat.precio_presentacion) / Number(cat.cantidad_presentacion)
      : Number(cat.precio_presentacion) || 0;
    setEditData((prev) => ({
      ...prev,
      materiales: prev.materiales.map((m) =>
        m._id === mid ? { ...m, material_id: cat.id, nombre: cat.nombre, precio, unidad_medida: cat.unidad_medida || '' } : m
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
          <h2 className="text-xl font-bold text-stone-800">Empaques Predeterminados</h2>
          <p className="text-stone-400 text-sm mt-0.5">{empaques.length} empaques</p>
        </div>
        <button onClick={startNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} /> Nuevo Empaque
        </button>
      </div>

      {/* Edit/create form */}
      {editData && (
        <div className={`${cx.card} p-5 mb-6 border-[var(--accent)]`}>
          <div className="mb-4">
            <label className={cx.label}>Nombre del empaque</label>
            <input
              type="text"
              value={editData.nombre}
              onChange={(e) => setEditData({ ...editData, nombre: e.target.value })}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) setEditData({ ...editData, nombre: v.charAt(0).toUpperCase() + v.slice(1) }); }}
              className={cx.input}
              autoFocus
            />
          </div>

          <h4 className="text-xs text-stone-400 uppercase tracking-wider font-semibold mb-3">Materiales</h4>

          {/* Desktop table */}
          <div className="hidden lg:block mb-3">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={cx.th + ' w-2/5'}>Material</th>
                  <th className={cx.th + ' w-1/6'}>Cantidad</th>
                  <th className={cx.th + ' w-1/6'}>Precio Unit.</th>
                  <th className={cx.th + ' w-1/6 text-right'}>Subtotal</th>
                  <th className={cx.th + ' w-10'}></th>
                </tr>
              </thead>
              <tbody>
                {editData.materiales.map((mat) => (
                  <tr key={mat._id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-2">
                      <SearchableSelect
                        options={catalogMateriales}
                        value={mat.material_id}
                        onChange={(item) => selectMaterial(mat._id, item)}
                        placeholder="Seleccionar material..."
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={mat.cantidad}
                          onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                          placeholder="1"
                          className="w-full bg-stone-100 rounded-lg px-3 py-2 text-stone-800 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
                        />
                        <span className="text-stone-400 text-xs">{mat.unidad_medida || ''}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-sm text-stone-500 text-center">
                      {formatCurrency(mat.precio)}
                    </td>
                    <td className="py-2 px-2 text-sm text-stone-800 font-medium text-right">
                      {formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}
                    </td>
                    <td className="py-2 pl-2">
                      <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden mb-3">
            {editData.materiales.map((mat) => (
              <div key={mat._id} className="bg-stone-100 rounded-xl p-3 space-y-2">
                <SearchableSelect
                  options={catalogMateriales}
                  value={mat.material_id}
                  onChange={(item) => selectMaterial(mat._id, item)}
                  placeholder="Seleccionar material..."
                />
                <div className="flex gap-2 items-center">
                  <div>
                    <label className={cx.label}>Cantidad</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={mat.cantidad}
                        onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                        placeholder="1"
                        className="w-20 bg-white rounded-lg px-2 py-1.5 text-stone-800 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
                      />
                      <span className="text-stone-400 text-xs">{mat.unidad_medida || ''}</span>
                    </div>
                  </div>
                  <div className="text-xs text-stone-500 text-right flex-1">
                    <p>Unit: {formatCurrency(mat.precio)}</p>
                    <p className="text-stone-800 font-medium">{formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}</p>
                  </div>
                  <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          {editData.materiales.some((m) => m.material_id) && (
            <div className="flex justify-end mb-3 pr-10">
              <div className="text-right">
                <span className="text-stone-400 text-xs">Costo total: </span>
                <span className="text-[var(--accent)] font-semibold text-sm">
                  {formatCurrency(editData.materiales.reduce((s, m) => s + (Number(m.precio) || 0) * (Number(m.cantidad) || 0), 0))}
                </span>
              </div>
            </div>
          )}

          <button onClick={addMaterial} className={cx.btnGhost + ' text-xs flex items-center gap-1 mb-4'}>
            <Plus size={13} /> Agregar Material
          </button>

          <div className="flex gap-2">
            <button onClick={save} className={cx.btnPrimary + ' flex items-center gap-1'}><Save size={14} /> Guardar</button>
            <button onClick={cancelEdit} className={cx.btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {empaques.map((emp) => {
          const totalCosto = (emp.materiales || []).reduce((s, m) => {
            const pu = Number(m.cantidad_presentacion) > 0 ? Number(m.precio_presentacion) / Number(m.cantidad_presentacion) : 0;
            return s + pu * (parseFloat(m.cantidad) || 0);
          }, 0);
          return (
            <div key={emp.id} className={`${cx.card} p-4`}>
              <div className="flex justify-between items-center cursor-pointer" onClick={() => setCollapsed((prev) => ({ ...prev, [emp.id]: prev[emp.id] === false ? true : false }))}>
                <div className="flex items-center gap-2 flex-1">
                  {collapsed[emp.id] === false ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />}
                  <div>
                    <h3 className="text-stone-800 font-medium text-sm">{emp.nombre}</h3>
                    <p className="text-stone-400 text-xs mt-0.5">
                      {(emp.materiales || []).length} materiales
                      {totalCosto > 0 && <span className="text-[var(--accent)] ml-2 font-semibold">{formatCurrency(totalCosto)}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => startEdit(emp)} className={cx.btnIcon}><Pencil size={15} /></button>
                  <button onClick={() => setDeleteTarget(emp)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={15} /></button>
                </div>
              </div>
              {collapsed[emp.id] === false && (emp.materiales || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-200 space-y-1">
                  {emp.materiales.map((m, i) => {
                    const pu = Number(m.cantidad_presentacion) > 0 ? Number(m.precio_presentacion) / Number(m.cantidad_presentacion) : 0;
                    const cant = parseFloat(m.cantidad) || 0;
                    return (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-stone-500">{m.nombre || `Material #${m.material_id}`}</span>
                        <span className="text-stone-400">
                          {cant} {m.unidad_medida || ''} × {formatCurrency(pu)} = <span className="text-stone-800">{formatCurrency(pu * cant)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
