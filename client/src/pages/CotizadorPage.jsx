import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCalculadorCostos } from '../hooks/useCalculadorCostos';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';

let tempId = 0;
const newTempId = () => `temp-${++tempId}`;

const emptyInsumoRow = () => ({
  _id: newTempId(),
  insumo_id: null,
  nombre: '',
  cantidad: '',
  costo_unitario: 0,
});

const emptyPreparacion = () => ({
  _id: newTempId(),
  nombre: '',
  capacidad: '',
  unidad: '',
  insumos: [emptyInsumoRow()],
  collapsed: false,
});

const emptyMaterial = () => ({
  _id: newTempId(),
  material_id: null,
  nombre: '',
  cantidad: '1',
  precio: 0,
});

export default function CotizadorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();

  const [nombre, setNombre] = useState('');
  const [preparaciones, setPreparaciones] = useState([emptyPreparacion()]);
  const [materiales, setMateriales] = useState([]);
  const [margen, setMargen] = useState(50);
  const [igvRate, setIgvRate] = useState(user?.igv_rate || 18);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!id);

  const [catalogInsumos, setCatalogInsumos] = useState([]);
  const [catalogMateriales, setCatalogMateriales] = useState([]);

  const costos = useCalculadorCostos(preparaciones, materiales, margen, igvRate);

  // Load catalogs
  useEffect(() => {
    api.get('/insumos').then((d) => setCatalogInsumos(d.data || [])).catch(() => {});
    api.get('/materiales').then((d) => setCatalogMateriales(d.data || [])).catch(() => {});
  }, []);

  // Load product for edit mode
  useEffect(() => {
    if (!id) return;
    setLoadingProduct(true);
    api.get(`/productos/${id}`)
      .then((data) => {
        const p = data.data || data;
        setNombre(p.nombre || '');
        setMargen(p.margen || 50);
        setIgvRate(p.igv_rate || user?.igv_rate || 18);

        if (p.preparaciones?.length) {
          setPreparaciones(
            p.preparaciones.map((prep) => ({
              _id: newTempId(),
              id: prep.id,
              nombre: prep.nombre || '',
              capacidad: prep.capacidad || '',
              unidad: prep.unidad || '',
              collapsed: false,
              insumos: (prep.insumos || []).map((ins) => ({
                _id: newTempId(),
                id: ins.id,
                insumo_id: ins.insumo_id,
                nombre: ins.nombre || '',
                cantidad: ins.cantidad_usada || ins.cantidad || '',
                costo_unitario: ins.costo_unitario || 0,
              })),
            }))
          );
        }

        if (p.materiales?.length) {
          setMateriales(
            p.materiales.map((mat) => ({
              _id: newTempId(),
              id: mat.id,
              material_id: mat.material_id,
              nombre: mat.nombre || '',
              cantidad: mat.cantidad || 1,
              precio: mat.precio || 0,
            }))
          );
        }
      })
      .catch(() => toast.error('Error cargando producto'))
      .finally(() => setLoadingProduct(false));
  }, [id]);

  // --- Preparaciones handlers ---
  const addPreparacion = () => {
    setPreparaciones((prev) => [...prev, emptyPreparacion()]);
  };

  const removePreparacion = (prepId) => {
    setPreparaciones((prev) => prev.filter((p) => p._id !== prepId));
  };

  const updatePreparacion = (prepId, field, value) => {
    setPreparaciones((prev) =>
      prev.map((p) => (p._id === prepId ? { ...p, [field]: value } : p))
    );
  };

  const toggleCollapse = (prepId) => {
    setPreparaciones((prev) =>
      prev.map((p) => (p._id === prepId ? { ...p, collapsed: !p.collapsed } : p))
    );
  };

  // --- Insumo handlers within preparacion ---
  const addInsumo = (prepId) => {
    setPreparaciones((prev) =>
      prev.map((p) =>
        p._id === prepId
          ? { ...p, insumos: [...p.insumos, emptyInsumoRow()] }
          : p
      )
    );
  };

  const removeInsumo = (prepId, insId) => {
    setPreparaciones((prev) =>
      prev.map((p) =>
        p._id === prepId
          ? { ...p, insumos: p.insumos.filter((i) => i._id !== insId) }
          : p
      )
    );
  };

  const updateInsumo = (prepId, insId, updates) => {
    setPreparaciones((prev) =>
      prev.map((p) =>
        p._id === prepId
          ? {
              ...p,
              insumos: p.insumos.map((i) =>
                i._id === insId ? { ...i, ...updates } : i
              ),
            }
          : p
      )
    );
  };

  const selectInsumo = (prepId, insId, catalogItem) => {
    const costoUnit =
      Number(catalogItem.cantidad_presentacion) > 0
        ? Number(catalogItem.precio_presentacion) / Number(catalogItem.cantidad_presentacion)
        : Number(catalogItem.precio_presentacion);
    updateInsumo(prepId, insId, {
      insumo_id: catalogItem.id,
      nombre: catalogItem.nombre,
      costo_unitario: costoUnit,
    });
  };

  // --- Material handlers ---
  const addMaterial = () => {
    setMateriales((prev) => [...prev, emptyMaterial()]);
  };

  const removeMaterial = (matId) => {
    setMateriales((prev) => prev.filter((m) => m._id !== matId));
  };

  const selectMaterial = (matId, catalogItem) => {
    setMateriales((prev) =>
      prev.map((m) =>
        m._id === matId
          ? {
              ...m,
              material_id: catalogItem.id,
              nombre: catalogItem.nombre,
              precio: Number(catalogItem.cantidad_presentacion) > 0
              ? Number(catalogItem.precio_presentacion) / Number(catalogItem.cantidad_presentacion)
              : Number(catalogItem.precio_presentacion) || 0,
            }
          : m
      )
    );
  };

  const updateMaterial = (matId, field, value) => {
    setMateriales((prev) =>
      prev.map((m) => (m._id === matId ? { ...m, [field]: value } : m))
    );
  };

  // --- Reset ---
  const handleReset = () => {
    setNombre('');
    setPreparaciones([emptyPreparacion()]);
    setMateriales([]);
    setMargen(50);
  };

  // --- Save ---
  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error('Ingresa un nombre para el producto');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        margen,
        igv_rate: igvRate,
        preparaciones: preparaciones.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          capacidad: p.capacidad,
          unidad: p.unidad,
          insumos: p.insumos
            .filter((i) => i.insumo_id)
            .map((i) => ({
              id: i.id,
              insumo_id: i.insumo_id,
              cantidad: Number(i.cantidad) || 0,
            })),
        })),
        materiales: materiales
          .filter((m) => m.material_id)
          .map((m) => ({
            id: m.id,
            material_id: m.material_id,
            cantidad: Number(m.cantidad) || 1,
          })),
        ...costos,
      };

      if (id) {
        await api.put(`/productos/${id}`, payload);
        toast.success('Producto actualizado');
      } else {
        const data = await api.post('/productos', payload);
        toast.success('Producto creado');
        const newId = data?.data?.id;
        if (newId) navigate(`/cotizador/${newId}`, { replace: true });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Prep subtotal
  const prepSubtotal = useCallback((prep) => {
    return (prep.insumos || []).reduce(
      (s, i) => s + (Number(i.costo_unitario) || 0) * (Number(i.cantidad) || 0),
      0
    );
  }, []);

  if (loadingProduct) {
    return (
      <div className="space-y-4">
        <div className={cx.skeleton + ' h-12 w-64'} />
        <div className={cx.skeleton + ' h-64'} />
        <div className={cx.skeleton + ' h-48'} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">
          {id ? 'Editar Producto' : 'Nuevo Producto'}
        </h2>
        <div className="flex gap-2">
          <button onClick={handleReset} className={cx.btnSecondary + ' flex items-center gap-2'}>
            <RotateCcw size={14} /> Vaciar
          </button>
          <button onClick={handleSave} disabled={saving} className={cx.btnPrimary + ' flex items-center gap-2'}>
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Guardar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: main form */}
        <div className="xl:col-span-2 space-y-6">
          {/* Product name */}
          <div className={`${cx.card} p-5`}>
            <label className={cx.label}>Nombre del producto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={cx.input + ' text-lg'}
              placeholder="Ej: Cheesecake de fresa 8 porciones"
              autoFocus
            />
          </div>

          {/* Preparaciones */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Preparaciones
              </h3>
              <button onClick={addPreparacion} className={cx.btnGhost + ' flex items-center gap-1'}>
                <Plus size={14} /> Agregar Preparacion
              </button>
            </div>

            <div className="space-y-4">
              {preparaciones.map((prep) => (
                <div key={prep._id} className={`${cx.card} overflow-hidden`}>
                  {/* Prep header */}
                  <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
                    <GripVertical size={16} className="text-zinc-700 flex-shrink-0" />
                    <input
                      type="text"
                      value={prep.nombre}
                      onChange={(e) => updatePreparacion(prep._id, 'nombre', e.target.value)}
                      placeholder="Nombre preparacion"
                      className="flex-1 bg-transparent text-white text-sm font-medium placeholder:text-zinc-600 focus:outline-none"
                    />
                    <input
                      type="number"
                      value={prep.capacidad}
                      onChange={(e) => updatePreparacion(prep._id, 'capacidad', e.target.value)}
                      placeholder="Capacidad"
                      className="w-20 bg-zinc-800 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                    />
                    <input
                      type="text"
                      value={prep.unidad}
                      onChange={(e) => updatePreparacion(prep._id, 'unidad', e.target.value)}
                      placeholder="Unidad"
                      className="w-16 bg-zinc-800 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                    />
                    <span className="text-[#FA7B21] font-semibold text-sm min-w-[80px] text-right">
                      {formatCurrency(prepSubtotal(prep))}
                    </span>
                    <button onClick={() => toggleCollapse(prep._id)} className={cx.btnIcon}>
                      {prep.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                    {preparaciones.length > 1 && (
                      <button onClick={() => removePreparacion(prep._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* Insumos table */}
                  {!prep.collapsed && (
                    <div className="p-4">
                      {/* Mobile insumo cards */}
                      <div className="space-y-3 lg:hidden">
                        {prep.insumos.map((ins) => (
                          <div key={ins._id} className="bg-zinc-800 rounded-xl p-3 space-y-2">
                            <SearchableSelect
                              options={catalogInsumos}
                              value={ins.insumo_id}
                              onChange={(item) => selectInsumo(prep._id, ins._id, item)}
                              placeholder="Seleccionar insumo..."
                            />
                            <div className="flex gap-2 items-center">
                              <input
                                type="number"
                                value={ins.cantidad}
                                onChange={(e) => updateInsumo(prep._id, ins._id, { cantidad: e.target.value })}
                                placeholder="Cant."
                                className="w-20 bg-zinc-900 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                              />
                              <span className="text-zinc-500 text-xs">x {formatCurrency(ins.costo_unitario)}</span>
                              <span className="ml-auto text-white text-sm font-medium">
                                {formatCurrency((Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0))}
                              </span>
                              <button onClick={() => removeInsumo(prep._id, ins._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop insumo table */}
                      <table className="w-full hidden lg:table">
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
                          {prep.insumos.map((ins) => (
                            <tr key={ins._id} className="border-b border-zinc-800/50 last:border-0">
                              <td className="py-2 pr-2">
                                <SearchableSelect
                                  options={catalogInsumos}
                                  value={ins.insumo_id}
                                  onChange={(item) => selectInsumo(prep._id, ins._id, item)}
                                  placeholder="Seleccionar insumo..."
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  value={ins.cantidad}
                                  onChange={(e) => updateInsumo(prep._id, ins._id, { cantidad: e.target.value })}
                                  placeholder="0"
                                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                                />
                              </td>
                              <td className="py-2 px-2 text-sm text-zinc-400 text-center">
                                {formatCurrency(ins.costo_unitario)}
                              </td>
                              <td className="py-2 px-2 text-sm text-white font-medium text-right">
                                {formatCurrency((Number(ins.costo_unitario) || 0) * (Number(ins.cantidad) || 0))}
                              </td>
                              <td className="py-2 pl-2">
                                <button onClick={() => removeInsumo(prep._id, ins._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <button
                        onClick={() => addInsumo(prep._id)}
                        className={cx.btnGhost + ' mt-2 flex items-center gap-1 text-xs'}
                      >
                        <Plus size={13} /> Agregar Insumo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Empaque / Materiales */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Empaque / Materiales
              </h3>
              <button onClick={addMaterial} className={cx.btnGhost + ' flex items-center gap-1'}>
                <Plus size={14} /> Agregar Material
              </button>
            </div>

            {materiales.length > 0 && (
              <div className={`${cx.card} p-4`}>
                {/* Mobile material cards */}
                <div className="space-y-3 lg:hidden">
                  {materiales.map((mat) => (
                    <div key={mat._id} className="bg-zinc-800 rounded-xl p-3 space-y-2">
                      <SearchableSelect
                        options={catalogMateriales}
                        value={mat.material_id}
                        onChange={(item) => selectMaterial(mat._id, item)}
                        placeholder="Seleccionar material..."
                      />
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={mat.cantidad}
                          onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                          placeholder="Cant."
                          className="w-20 bg-zinc-900 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                        />
                        <span className="text-zinc-500 text-xs">x {formatCurrency(mat.precio)}</span>
                        <span className="ml-auto text-white text-sm font-medium">
                          {formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}
                        </span>
                        <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop material table */}
                <table className="w-full hidden lg:table">
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
                    {materiales.map((mat) => (
                      <tr key={mat._id} className="border-b border-zinc-800/50 last:border-0">
                        <td className="py-2 pr-2">
                          <SearchableSelect
                            options={catalogMateriales}
                            value={mat.material_id}
                            onChange={(item) => selectMaterial(mat._id, item)}
                            placeholder="Seleccionar material..."
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={mat.cantidad}
                            onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                            placeholder="1"
                            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                          />
                        </td>
                        <td className="py-2 px-2 text-sm text-zinc-400 text-center">
                          {formatCurrency(mat.precio)}
                        </td>
                        <td className="py-2 px-2 text-sm text-white font-medium text-right">
                          {formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}
                        </td>
                        <td className="py-2 pl-2">
                          <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-red-400'}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {materiales.length === 0 && (
              <div className={`${cx.card} p-8 text-center`}>
                <p className="text-zinc-500 text-sm">Sin materiales de empaque.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: cost summary (sticky) */}
        <div className="xl:col-span-1">
          <div className={`${cx.card} p-5 xl:sticky xl:top-6 space-y-4`}>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Resumen de Costos
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Costo insumos</span>
                <span className="text-white">{formatCurrency(costos.costoInsumos)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Costo empaque</span>
                <span className="text-white">{formatCurrency(costos.costoEmpaque)}</span>
              </div>
              <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm font-semibold">
                <span className="text-zinc-300">Costo neto</span>
                <span className="text-white">{formatCurrency(costos.costoNeto)}</span>
              </div>
            </div>

            {/* Margen slider */}
            <div>
              <label className={cx.label}>Margen</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={margen}
                  onChange={(e) => setMargen(Number(e.target.value))}
                  className="flex-1 accent-[#FA7B21] h-1.5"
                />
                <input
                  type="number"
                  value={margen}
                  onChange={(e) => setMargen(Math.min(90, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-16 bg-zinc-800 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                />
                <span className="text-zinc-500 text-sm">%</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Precio de venta</span>
                <span className="text-white font-medium">{formatCurrency(costos.precioVenta)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">IGV ({costos.igvRate}%)</span>
                <span className="text-white">{formatCurrency(costos.igvMonto)}</span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-300 font-semibold">Precio final</span>
                <span className="text-2xl font-bold text-[#FA7B21]">
                  {formatCurrency(costos.precioFinal)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className={cx.btnPrimary + ' w-full flex items-center justify-center gap-2 mt-2'}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={14} /> Guardar producto
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
