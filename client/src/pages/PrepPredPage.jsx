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
    setEditData({ nombre: '', capacidad: '', unidad: '', insumos: [{ _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0, unidad_medida: '' }] });
  };

  const startEdit = (prep) => {
    setEditingId(prep.id);
    setEditData({
      nombre: prep.nombre,
      capacidad: parseFloat(prep.capacidad) || '',
      unidad: prep.unidad_capacidad || prep.unidad || '',
      insumos: (prep.insumos || []).map((i) => {
        const cu = Number(i.cantidad_presentacion) > 0
          ? Number(i.precio_presentacion) / Number(i.cantidad_presentacion)
          : Number(i.costo_unitario) || 0;
        return {
          ...i,
          _id: newId(),
          cantidad: parseFloat(i.cantidad) || '',
          costo_unitario: cu,
          unidad_medida: i.unidad_medida || '',
        };
      }),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const addInsumo = () => {
    setEditData((prev) => ({
      ...prev,
      insumos: [...prev.insumos, { _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0, unidad_medida: '' }],
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
        i._id === iid ? { ...i, insumo_id: cat.id, nombre: cat.nombre, costo_unitario: costoUnit, unidad_medida: cat.unidad_medida || '' } : i
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
              <select value={editData.unidad} onChange={(e) => setEditData({ ...editData, unidad: e.target.value })} className={cx.select}>
                <option value="">Seleccionar</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="uni">uni</option>
                <option value="oz">oz</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
              </select>
            </div>
          </div>

          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3">Insumos</h4>

          {/* Desktop table */}
          <div className="hidden lg:block mb-3">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={cx.th + ' w-2/5'}>Insumo</th>
                  <th className={cx.th + ' w-1/6'}>Cantidad</th>
                  <th className={cx.th + ' w-1/6'}>Costo Unit.</th>
                  <th className={cx.th + ' w-1/6 text-right'}>Subtotal</th>
                  <th className={cx.th + ' w-10'}></th>
                </tr>
              </thead>
              <tbody>
                {editData.insumos.map((ins) => (
                  <tr key={ins._id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 pr-2">
                      <SearchableSelect
                        options={catalogInsumos}
                        value={ins.insumo_id}
                        onChange={(item) => selectInsumo(ins._id, item)}
                        placeholder="Seleccionar insumo..."
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={ins.cantidad}
                          onChange={(e) => updateInsumo(ins._id, 'cantidad', e.target.value)}
                          placeholder="0"
                          className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                        />
                        <span className="text-zinc-500 text-xs">{ins.unidad_medida || ''}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-sm text-zinc-400 text-center">
                      {formatCurrency(ins.costo_unitario)}
                    </td>
                    <td className="py-2 px-2 text-sm text-white font-medium text-right">
                      {formatCurrency((Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0))}
                    </td>
                    <td className="py-2 pl-2">
                      <button onClick={() => removeInsumo(ins._id)} className={cx.btnIcon + ' hover:text-red-400'}>
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
            {editData.insumos.map((ins) => (
              <div key={ins._id} className="bg-zinc-800 rounded-xl p-3 space-y-2">
                <SearchableSelect
                  options={catalogInsumos}
                  value={ins.insumo_id}
                  onChange={(item) => selectInsumo(ins._id, item)}
                  placeholder="Seleccionar insumo..."
                />
                <div className="flex gap-2 items-center">
                  <div>
                    <label className={cx.label}>Cantidad</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={ins.cantidad}
                        onChange={(e) => updateInsumo(ins._id, 'cantidad', e.target.value)}
                        placeholder="0"
                        className="w-20 bg-zinc-900 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                      />
                      <span className="text-zinc-500 text-xs">{ins.unidad_medida || ''}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 text-right flex-1">
                    <p>Unit: {formatCurrency(ins.costo_unitario)}</p>
                    <p className="text-white font-medium">{formatCurrency((Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0))}</p>
                  </div>
                  <button onClick={() => removeInsumo(ins._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          {editData.insumos.some(i => i.insumo_id) && (
            <div className="flex justify-end mb-3 pr-10">
              <div className="text-right">
                <span className="text-zinc-500 text-xs">Costo total: </span>
                <span className="text-[#FA7B21] font-semibold text-sm">
                  {formatCurrency(editData.insumos.reduce((s, i) => s + (Number(i.costo_unitario) || 0) * (Number(i.cantidad) || 0), 0))}
                </span>
              </div>
            </div>
          )}

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
        {preps.map((prep) => {
          const totalCosto = (prep.insumos || []).reduce((s, ins) => {
            const cu = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
            return s + cu * (parseFloat(ins.cantidad) || 0);
          }, 0);
          return (
            <div key={prep.id} className={`${cx.card} p-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-white font-medium text-sm">{prep.nombre}</h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    {prep.capacidad && `Rinde: ${parseFloat(prep.capacidad)} ${prep.unidad_capacidad || prep.unidad || ''} — `}
                    {(prep.insumos || []).length} insumos
                    {totalCosto > 0 && <span className="text-[#FA7B21] ml-2 font-semibold">{formatCurrency(totalCosto)}</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(prep)} className={cx.btnIcon}><Pencil size={15} /></button>
                  <button onClick={() => setDeleteTarget(prep)} className={cx.btnIcon + ' hover:text-red-400'}><Trash2 size={15} /></button>
                </div>
              </div>
              {(prep.insumos || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                  {prep.insumos.map((ins, i) => {
                    const cu = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
                    const cant = parseFloat(ins.cantidad) || 0;
                    return (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-zinc-400">{ins.nombre || `Insumo #${ins.insumo_id}`}</span>
                        <span className="text-zinc-500">
                          {cant} {ins.unidad_medida || ''} × {formatCurrency(cu)} = <span className="text-white">{formatCurrency(cu * cant)}</span>
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
        title="Eliminar preparacion"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
