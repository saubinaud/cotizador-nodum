import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Save, X, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { useTerminos } from '../context/TerminosContext';

// Normalize unit: l → L, handle case variations
function normU(u) {
  if (!u) return '';
  if (u === 'l') return 'L';
  return u;
}

// Factor to convert 1 unit of 'de' into 'a'
// Ej: factorConversion('g', 'kg') = 0.001 (1g = 0.001kg)
const FACTORES = {
  'g→kg': 0.001, 'kg→g': 1000,
  'g→oz': 0.03527, 'oz→g': 28.3495,
  'kg→oz': 35.274, 'oz→kg': 0.02835,
  'ml→L': 0.001, 'L→ml': 1000, 'cm→mt': 0.01, 'mt→cm': 100,
};

function convertirUnidad(valor, deUnidad, aUnidad) {
  const de = normU(deUnidad);
  const a = normU(aUnidad);
  if (!de || !a || de === a) return valor;
  const key = `${de}→${a}`;
  if (FACTORES[key]) return valor * FACTORES[key];
  return valor;
}

function getUnidadesCompatibles(unidadBase) {
  if (!unidadBase) return ['g', 'kg', 'ml', 'L', 'uni', 'oz'];
  const u = normU(unidadBase);
  const grupos = [
    ['g', 'kg', 'oz'],
    ['ml', 'L'],
    ['uni'], ['cm', 'mt'],
  ];
  for (const grupo of grupos) {
    if (grupo.includes(u)) return grupo;
  }
  return [u];
}

function costoEnUsoUnidad(ins) {
  const original = normU(ins.unidad_medida);
  const uso = normU(ins.uso_unidad);
  if (!uso || !original || uso === original) return Number(ins.costo_unitario) || 0;
  // costo_unitario es por unidad original (ej: S/10 por kg)
  // Si uso_unidad = g: costo_por_g = costo_por_kg × convertir(1g → kg) = 10 × 0.001 = 0.01
  const factor = convertirUnidad(1, uso, original);
  return factor > 0 ? (Number(ins.costo_unitario) || 0) * factor : (Number(ins.costo_unitario) || 0);
}

let tmpId = 0;
const newId = () => `tmp-${++tmpId}`;

export default function PrepPredPage() {
  const api = useApi();
  const toast = useToast();
  const t = useTerminos();

  const [preps, setPreps] = useState([]);
  const [catalogInsumos, setCatalogInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    loadPreps();
    api.get('/insumos').then((d) => setCatalogInsumos(d.data || [])).catch(() => {});
  }, []);

  const enrichedInsumos = useMemo(() => {
    const groups = {};
    catalogInsumos.forEach((ins) => {
      const key = (ins.nombre || '').toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(ins);
    });

    const cheapestIds = new Set();
    Object.values(groups).forEach((variants) => {
      if (variants.length <= 1) return;
      let cheapest = variants[0];
      let cheapestCost = Infinity;
      variants.forEach((v) => {
        const cost = Number(v.cantidad_presentacion) > 0
          ? Number(v.precio_presentacion) / Number(v.cantidad_presentacion)
          : Infinity;
        if (cost < cheapestCost) {
          cheapestCost = cost;
          cheapest = v;
        }
      });
      cheapestIds.add(cheapest.id);
    });

    return catalogInsumos.map((ins) => {
      const key = (ins.nombre || '').toLowerCase();
      const hasVariants = (groups[key] || []).length > 1;
      const costoUnit = Number(ins.cantidad_presentacion) > 0
        ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion)
        : 0;
      const isBest = cheapestIds.has(ins.id);
      return {
        ...ins,
        nombre: hasVariants
          ? `${ins.nombre} (${parseFloat(ins.cantidad_presentacion)}${ins.unidad_medida || ''} - ${formatCurrency(ins.precio_presentacion)})${isBest ? ' \u2605' : ''}`
          : ins.nombre,
        _originalNombre: ins.nombre,
        _isBest: isBest,
        _hasVariants: hasVariants,
        _costoUnit: costoUnit,
      };
    }).sort((a, b) => {
      const nameCompare = (a._originalNombre || '').localeCompare(b._originalNombre || '');
      if (nameCompare !== 0) return nameCompare;
      return a._costoUnit - b._costoUnit;
    });
  }, [catalogInsumos]);

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
    setEditData({ nombre: '', capacidad: '', unidad: '', insumos: [{ _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0, unidad_medida: '', uso_unidad: '' }] });
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
          uso_unidad: i.uso_unidad || i.unidad_medida || '',
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
      insumos: [...prev.insumos, { _id: newId(), insumo_id: null, nombre: '', cantidad: '', costo_unitario: 0, unidad_medida: '', uso_unidad: '' }],
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
        i._id === iid ? { ...i, insumo_id: cat.id, nombre: cat._originalNombre || cat.nombre, costo_unitario: costoUnit, unidad_medida: cat.unidad_medida || '', uso_unidad: cat.unidad_medida || '' } : i
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
      insumos: editData.insumos.filter((i) => i.insumo_id).map((i) => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) || 0, uso_unidad: i.uso_unidad || i.unidad_medida || null })),
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
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-stone-900">{t.prep_pred}</h1>
        <button onClick={startNew} disabled={editingId !== null} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* Edit/create form */}
      {editData && (
        <div className={`${cx.card} p-4 mb-4 border-[var(--accent)]`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
              <CustomSelect
                value={editData.unidad}
                onChange={(v) => setEditData({ ...editData, unidad: v })}
                options={[
                  { value: '', label: 'Seleccionar' },
                  { value: 'g', label: 'g' },
                  { value: 'ml', label: 'ml' },
                  { value: 'uni', label: 'uni' },
                  { value: 'oz', label: 'oz' },
                  { value: 'kg', label: 'kg' },
                  { value: 'L', label: 'L' },
                ]}
                placeholder="Seleccionar"
              />
            </div>
          </div>

          <h4 className="text-xs text-stone-400 uppercase tracking-wider font-semibold mb-3">Insumos</h4>

          {/* Desktop table */}
          <div className="hidden lg:block mb-3">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={cx.th + ' w-2/5'}>Insumo</th>
                  <th className={cx.th + ' w-1/5'}>Cantidad / U.M.</th>
                  <th className={cx.th + ' w-1/6'}>Costo Unit.</th>
                  <th className={cx.th + ' w-1/6 text-right'}>Subtotal</th>
                  <th className={cx.th + ' w-10'}></th>
                </tr>
              </thead>
              <tbody>
                {editData.insumos.map((ins) => (
                  <tr key={ins._id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-2">
                      <SearchableSelect
                        options={enrichedInsumos}
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
                          className="w-full bg-stone-100 rounded-lg px-3 py-2 text-stone-800 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
                        />
                        <CustomSelect
                          value={ins.uso_unidad || ins.unidad_medida || ''}
                          onChange={(v) => updateInsumo(ins._id, 'uso_unidad', v)}
                          options={getUnidadesCompatibles(ins.unidad_medida).map(u => ({ value: u, label: u }))}
                          className="w-16" compact
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-sm text-stone-500 text-center">
                      {formatCurrency(costoEnUsoUnidad(ins))}
                    </td>
                    <td className="py-2 px-2 text-sm text-stone-800 font-medium text-right">
                      {formatCurrency(costoEnUsoUnidad(ins) * (Number(ins.cantidad) || 0))}
                    </td>
                    <td className="py-2 pl-2">
                      <button onClick={() => removeInsumo(ins._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
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
              <div key={ins._id} className="bg-stone-100 rounded-xl p-3 space-y-2">
                <SearchableSelect
                  options={enrichedInsumos}
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
                        className="w-24 bg-white rounded-lg px-2 py-2 text-stone-800 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30"
                      />
                      <CustomSelect
                        value={ins.uso_unidad || ins.unidad_medida || ''}
                        onChange={(v) => updateInsumo(ins._id, 'uso_unidad', v)}
                        options={getUnidadesCompatibles(ins.unidad_medida).map(u => ({ value: u, label: u }))}
                        className="w-16" compact
                      />
                    </div>
                  </div>
                  <div className="text-xs text-stone-500 text-right flex-1">
                    <p>Unit: {formatCurrency(costoEnUsoUnidad(ins))}</p>
                    <p className="text-stone-800 font-medium">{formatCurrency(costoEnUsoUnidad(ins) * (Number(ins.cantidad) || 0))}</p>
                  </div>
                  <button onClick={() => removeInsumo(ins._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
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
                <span className="text-stone-400 text-xs">Costo total: </span>
                <span className="text-[var(--accent)] font-semibold text-sm">
                  {formatCurrency(editData.insumos.reduce((s, i) => s + costoEnUsoUnidad(i) * (Number(i.cantidad) || 0), 0))}
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

      {/* List — ONE card with divide-y (Airbnb accordion) */}
      {preps.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <p className="text-stone-400 text-sm">No hay preparaciones guardadas</p>
        </div>
      ) : (
        <div className={`${cx.card} divide-y divide-stone-100`}>
          {preps.map((prep) => {
            const totalCosto = (prep.insumos || []).reduce((s, ins) => {
              const cuBase = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
              const cu = costoEnUsoUnidad({ ...ins, costo_unitario: cuBase });
              return s + cu * (parseFloat(ins.cantidad) || 0);
            }, 0);
            const isExpanded = collapsed[prep.id] === false;
            return (
              <div key={prep.id} className="p-4">
                {/* Clickable header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [prep.id]: prev[prep.id] === false ? true : false }))}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                    }
                    <div>
                      <span className="text-sm font-semibold text-stone-900">{prep.nombre}</span>
                      {prep.capacidad && (
                        <span className="text-xs text-stone-500 ml-2">
                          Rinde {parseFloat(prep.capacidad)} {prep.unidad_capacidad || prep.unidad || ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {totalCosto > 0 && (
                      <span className="text-sm font-semibold text-[var(--accent)]">{formatCurrency(totalCosto)}</span>
                    )}
                    <button onClick={() => startEdit(prep)} className={cx.btnIcon}><Pencil size={15} /></button>
                    <button onClick={() => setDeleteTarget(prep)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={15} /></button>
                  </div>
                </div>
                {/* Collapsed content */}
                {isExpanded && (prep.insumos || []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <div className="border border-stone-100 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-stone-50">
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Insumo</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cant.</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">C.Unit</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prep.insumos.map((ins, i) => {
                            const cuBase = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
                            const cu = costoEnUsoUnidad({ ...ins, costo_unitario: cuBase });
                            const cant = parseFloat(ins.cantidad) || 0;
                            const unidadMostrar = normU(ins.uso_unidad) || normU(ins.unidad_medida) || '';
                            return (
                              <tr key={i} className="border-t border-stone-50">
                                <td className="px-3 py-2 text-stone-800">{ins.nombre || `Insumo #${ins.insumo_id}`}</td>
                                <td className="px-3 py-2 text-center text-stone-600">{cant} {unidadMostrar}</td>
                                <td className="px-3 py-2 text-center text-stone-500">{formatCurrency(cu)}</td>
                                <td className="px-3 py-2 text-right text-stone-800 font-medium">{formatCurrency(cu * cant)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
