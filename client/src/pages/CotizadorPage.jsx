import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCalculadorCostos } from '../hooks/useCalculadorCostos';
import { cx } from '../styles/tokens';
import { formatCurrency, precioComercial } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageIcon,
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
  cantidad_por_unidad: '',
  insumos: [emptyInsumoRow()],
  collapsed: false,
});

const emptyMaterial = (tipo = 'entero') => ({
  _id: newTempId(),
  material_id: null,
  nombre: '',
  cantidad: '1',
  precio: 0,
  empaque_tipo: tipo,
});

export default function CotizadorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();

  const [nombre, setNombre] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [preparaciones, setPreparaciones] = useState([emptyPreparacion()]);
  const [materiales, setMateriales] = useState([]);
  const [margen, setMargen] = useState(50);
  // igv_rate in DB is decimal (0.18), hook expects integer (18)
  const [igvRate, setIgvRate] = useState(user?.igv_rate ? Math.round(user.igv_rate * 100) : 18);
  const [tipoPresentacion, setTipoPresentacion] = useState('unidad');
  const [unidadesPorProducto, setUnidadesPorProducto] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!id);

  const [catalogInsumos, setCatalogInsumos] = useState([]);
  const [catalogMateriales, setCatalogMateriales] = useState([]);
  const [catalogPreps, setCatalogPreps] = useState([]);

  const costos = useCalculadorCostos(preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto);

  // Load catalogs
  useEffect(() => {
    api.get('/insumos').then((d) => setCatalogInsumos(d.data || [])).catch(() => {});
    api.get('/materiales').then((d) => setCatalogMateriales(d.data || [])).catch(() => {});
    api.get('/predeterminados/preparaciones').then((d) => setCatalogPreps(d.data || [])).catch(() => {});
  }, []);

  // Load product for edit mode
  useEffect(() => {
    if (!id) return;
    setLoadingProduct(true);
    api.get(`/productos/${id}`)
      .then((data) => {
        const p = data.data || data;
        setNombre(p.nombre || '');
        setImagenUrl(p.imagen_url || '');
        setTipoPresentacion(p.tipo_presentacion || 'unidad');
        setUnidadesPorProducto(parseInt(p.unidades_por_producto) || 1);
        // DB stores decimals (0.5, 0.18), UI uses integers (50, 18)
        setMargen(p.margen ? Math.round(p.margen * 100) : 50);
        setIgvRate(p.igv_rate ? Math.round(p.igv_rate * 100) : (user?.igv_rate ? Math.round(user.igv_rate * 100) : 18));

        if (p.preparaciones?.length) {
          setPreparaciones(
            p.preparaciones.map((prep) => ({
              _id: newTempId(),
              id: prep.id,
              nombre: prep.nombre || '',
              capacidad: parseFloat(prep.capacidad) || '',
              unidad: prep.unidad_capacidad || prep.unidad || '',
              cantidad_por_unidad: parseFloat(prep.cantidad_por_unidad) || '',
              collapsed: false,
              insumos: (prep.insumos || []).map((ins) => {
                const cu = Number(ins.cantidad_presentacion) > 0
                  ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion)
                  : Number(ins.precio_presentacion) || 0;
                return {
                  _id: newTempId(),
                  id: ins.id,
                  insumo_id: ins.insumo_id,
                  nombre: ins.nombre || '',
                  unidad_medida: ins.unidad_medida || '',
                  cantidad: parseFloat(ins.cantidad_usada || ins.cantidad) || '',
                  costo_unitario: cu,
                };
              }),
            }))
          );
        }

        if (p.materiales?.length) {
          setMateriales(
            p.materiales.map((mat) => {
              const precio = Number(mat.cantidad_presentacion) > 0
                ? Number(mat.precio_presentacion) / Number(mat.cantidad_presentacion)
                : Number(mat.precio_presentacion) || 0;
              return {
                _id: newTempId(),
                id: mat.id,
                material_id: mat.material_id,
                nombre: mat.nombre || '',
                unidad_medida: mat.unidad_medida || '',
                cantidad: parseFloat(mat.cantidad) || 1,
                precio,
                empaque_tipo: mat.empaque_tipo || 'entero',
              };
            })
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

  const loadPredeterminada = (pred) => {
    const newPrep = {
      _id: newTempId(),
      nombre: pred.nombre,
      capacidad: parseFloat(pred.capacidad) || '',
      unidad: pred.unidad_capacidad || '',
      collapsed: false,
      insumos: (pred.insumos || []).map((ins) => {
        const cu = Number(ins.cantidad_presentacion) > 0
          ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion)
          : Number(ins.precio_presentacion) || 0;
        return {
          _id: newTempId(),
          insumo_id: ins.insumo_id,
          nombre: ins.nombre || '',
          unidad_medida: ins.unidad_medida || '',
          cantidad: parseFloat(ins.cantidad) || '',
          costo_unitario: cu,
        };
      }),
    };
    setPreparaciones((prev) => [...prev, newPrep]);
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
      unidad_medida: catalogItem.unidad_medida,
    });
  };

  // --- Material handlers ---
  const addMaterial = (tipo = 'entero') => {
    setMateriales((prev) => [...prev, emptyMaterial(tipo)]);
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
              unidad_medida: catalogItem.unidad_medida,
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
    setTipoPresentacion('unidad');
    setUnidadesPorProducto(1);
    setImagenUrl('');
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
        imagen_url: imagenUrl.trim() || null,
        margen,          // backend normalizes integer% → decimal
        igv_rate: igvRate / 100,
        tipo_presentacion: tipoPresentacion,
        unidades_por_producto: tipoPresentacion === 'entero' ? unidadesPorProducto : 1,
        preparaciones: preparaciones.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          capacidad: p.capacidad,
          unidad: p.unidad,
          cantidad_por_unidad: Number(p.cantidad_por_unidad) || null,
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
            empaque_tipo: m.empaque_tipo || 'entero',
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

  // Helper to render a list of materials (mobile cards + desktop table)
  const renderMaterialsList = (mats) => {
    if (mats.length === 0) {
      return <p className="text-zinc-500 text-sm text-center py-2">Sin materiales.</p>;
    }
    return (
      <div className={`${cx.card} p-4`}>
        {/* Mobile material cards */}
        <div className="space-y-3 lg:hidden">
          {mats.map((mat) => (
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
                <span className="text-zinc-500 text-xs">{mat.unidad_medida || ''}</span>
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
            {mats.map((mat) => (
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
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={mat.cantidad}
                      onChange={(e) => updateMaterial(mat._id, 'cantidad', e.target.value)}
                      placeholder="1"
                      className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                    />
                    <span className="text-zinc-500 text-xs">{mat.unidad_medida || ''}</span>
                  </div>
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
    );
  };

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={cx.label}>Nombre del producto</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className={cx.input + ' text-lg'}
                  placeholder="Ej: Cheesecake de fresa"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cx.label}>Presentacion</label>
                  <select
                    value={tipoPresentacion}
                    onChange={(e) => setTipoPresentacion(e.target.value)}
                    className={cx.select}
                  >
                    <option value="unidad">Por unidad</option>
                    <option value="entero">Producto entero</option>
                  </select>
                </div>
                {tipoPresentacion === 'entero' && (
                  <div>
                    <label className={cx.label}>Unidades por producto</label>
                    <input
                      type="number"
                      min="1"
                      value={unidadesPorProducto}
                      onChange={(e) => setUnidadesPorProducto(Math.max(1, parseInt(e.target.value) || 1))}
                      className={cx.input}
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className={cx.label}>Imagen URL (opcional)</label>
              <input
                type="text"
                value={imagenUrl}
                onChange={(e) => setImagenUrl(e.target.value)}
                className={cx.input}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Preparaciones */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Preparaciones
              </h3>
              <div className="flex items-center gap-2">
                {catalogPreps.length > 0 && (
                  <div className="w-56">
                    <SearchableSelect
                      options={catalogPreps}
                      value={null}
                      onChange={(pred) => loadPredeterminada(pred)}
                      placeholder="Predeterminada..."
                      displayKey="nombre"
                      valueKey="id"
                    />
                  </div>
                )}
                <button onClick={addPreparacion} className={cx.btnGhost + ' flex items-center gap-1'}>
                  <Plus size={14} /> Nueva
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {preparaciones.map((prep) => (
                <div key={prep._id} className={cx.card}>
                  {/* Prep header */}
                  <div className="flex items-end gap-2 p-4 border-b border-zinc-800">
                    <GripVertical size={16} className="text-zinc-700 flex-shrink-0 mb-2" />
                    <div className="flex-1">
                      <label className={cx.label}>Nombre</label>
                      <input
                        type="text"
                        value={prep.nombre}
                        onChange={(e) => updatePreparacion(prep._id, 'nombre', e.target.value)}
                        placeholder="Nombre preparacion"
                        className="w-full bg-transparent text-white text-sm font-medium placeholder:text-zinc-600 focus:outline-none"
                      />
                    </div>
                    <div className="w-20">
                      <label className={cx.label}>Rendimiento</label>
                      <input
                        type="number"
                        value={prep.capacidad}
                        onChange={(e) => updatePreparacion(prep._id, 'capacidad', e.target.value)}
                        placeholder="0"
                        className="w-full bg-zinc-800 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30"
                      />
                    </div>
                    <div className="w-16">
                      <label className={cx.label}>Unidad</label>
                      <select
                        value={prep.unidad}
                        onChange={(e) => updatePreparacion(prep._id, 'unidad', e.target.value)}
                        className="w-full bg-zinc-800 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30 appearance-none"
                      >
                        <option value="">--</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="uni">uni</option>
                        <option value="oz">oz</option>
                      </select>
                    </div>
                    <span className="text-[#FA7B21] font-semibold text-sm min-w-[80px] text-right mb-1">
                      {formatCurrency(prepSubtotal(prep))}
                    </span>
                    <button onClick={() => toggleCollapse(prep._id)} className={cx.btnIcon + ' mb-1'}>
                      {prep.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                    {preparaciones.length > 1 && (
                      <button onClick={() => removePreparacion(prep._id)} className={cx.btnIcon + ' hover:text-red-400 mb-1'}>
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
                              <span className="text-zinc-500 text-xs">{ins.unidad_medida || ''}</span>
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
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={ins.cantidad}
                                    onChange={(e) => updateInsumo(prep._id, ins._id, { cantidad: e.target.value })}
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

          {/* Porciones */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Composicion del producto
            </h3>
            <div className={`${cx.card} p-4`}>
              {preparaciones.filter(p => p.nombre).length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">Agrega preparaciones arriba para definir porciones</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <table className="w-full hidden lg:table">
                    <thead>
                      <tr>
                        <th className={cx.th}>Preparacion</th>
                        <th className={cx.th}>Rendimiento</th>
                        <th className={cx.th + ' w-32'}>Para el producto</th>
                        <th className={cx.th}>Productos por tanda</th>
                        <th className={cx.th + ' text-right'}>Costo prep.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preparaciones.filter(p => p.nombre).map((prep) => {
                        const costoPrep = (prep.insumos || []).reduce((s, i) => s + (Number(i.costo_unitario) || 0) * (Number(i.cantidad) || 0), 0);
                        const rendimiento = Number(prep.capacidad) || 0;
                        const cantPorUni = Number(prep.cantidad_por_unidad) || 0;
                        const alcanzaPara = rendimiento > 0 && cantPorUni > 0 ? Math.floor(rendimiento / cantPorUni) : 0;
                        const costoPorUni = rendimiento > 0 && cantPorUni > 0 ? (costoPrep / rendimiento) * cantPorUni : costoPrep;
                        return (
                          <tr key={prep._id} className="border-b border-zinc-800/50 last:border-0">
                            <td className={cx.td + ' text-white font-medium'}>{prep.nombre}</td>
                            <td className={cx.td + ' text-zinc-400'}>{rendimiento > 0 ? `${rendimiento} ${prep.unidad || ''}` : '--'}</td>
                            <td className={cx.td}>
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" step="0.01" value={prep.cantidad_por_unidad} onChange={(e) => updatePreparacion(prep._id, 'cantidad_por_unidad', e.target.value)} className={cx.input + ' w-20 text-center'} placeholder="0" />
                                <span className="text-zinc-500 text-xs">{prep.unidad || ''}</span>
                              </div>
                            </td>
                            <td className={cx.td + ' text-zinc-300'}>{alcanzaPara > 0 ? `${alcanzaPara} productos` : '--'}</td>
                            <td className={cx.td + ' text-right text-[#FA7B21] font-semibold'}>{formatCurrency(costoPorUni)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {preparaciones.filter(p => p.nombre).map((prep) => {
                      const costoPrep = (prep.insumos || []).reduce((s, i) => s + (Number(i.costo_unitario) || 0) * (Number(i.cantidad) || 0), 0);
                      const rendimiento = Number(prep.capacidad) || 0;
                      const cantPorUni = Number(prep.cantidad_por_unidad) || 0;
                      const alcanzaPara = rendimiento > 0 && cantPorUni > 0 ? Math.floor(rendimiento / cantPorUni) : 0;
                      const costoPorUni = rendimiento > 0 && cantPorUni > 0 ? (costoPrep / rendimiento) * cantPorUni : costoPrep;
                      return (
                        <div key={prep._id} className="bg-zinc-800 rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-white text-sm font-medium">{prep.nombre}</span>
                            <span className="text-zinc-400 text-xs">{rendimiento > 0 ? `Rinde: ${rendimiento} ${prep.unidad || ''}` : ''}</span>
                          </div>
                          <div className="flex gap-3 items-center">
                            <div>
                              <label className={cx.label}>Para el producto</label>
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" step="0.01" value={prep.cantidad_por_unidad} onChange={(e) => updatePreparacion(prep._id, 'cantidad_por_unidad', e.target.value)} className="w-20 bg-zinc-900 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#FA7B21]/30" placeholder="0" />
                                <span className="text-zinc-500 text-xs">{prep.unidad || ''}</span>
                              </div>
                            </div>
                            <div className="text-xs text-zinc-400">
                              {alcanzaPara > 0 && <p>{alcanzaPara} productos/tanda</p>}
                              <p className="text-[#FA7B21] font-semibold">{formatCurrency(costoPorUni)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Empaque / Materiales */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Empaque / Materiales
            </h3>

            {tipoPresentacion === 'entero' ? (
              <>
                {/* Empaque producto entero */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-400">Producto entero</h4>
                    <button onClick={() => addMaterial('entero')} className={cx.btnGhost + ' flex items-center gap-1 text-xs'}>
                      <Plus size={13} /> Agregar
                    </button>
                  </div>
                  {renderMaterialsList(materiales.filter(m => (m.empaque_tipo || 'entero') === 'entero'))}
                </div>

                {/* Empaque por unidad */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-400">Por unidad ({unidadesPorProducto} uni)</h4>
                    <button onClick={() => addMaterial('unidad')} className={cx.btnGhost + ' flex items-center gap-1 text-xs'}>
                      <Plus size={13} /> Agregar
                    </button>
                  </div>
                  {renderMaterialsList(materiales.filter(m => m.empaque_tipo === 'unidad'))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span />
                  <button onClick={() => addMaterial('entero')} className={cx.btnGhost + ' flex items-center gap-1'}>
                    <Plus size={14} /> Agregar Material
                  </button>
                </div>
                {materiales.length > 0 ? (
                  renderMaterialsList(materiales)
                ) : (
                  <div className={`${cx.card} p-8 text-center`}>
                    <p className="text-zinc-500 text-sm">Sin materiales de empaque.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column: cost summary (sticky) */}
        <div className="xl:col-span-1">
          <div className={`${cx.card} p-5 xl:sticky xl:top-6 space-y-4`}>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Resumen de Costos
            </h3>

            {tipoPresentacion === 'entero' ? (
              <>
                {/* Product costs */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Costo insumos (producto)</span>
                    <span className="text-white">{formatCurrency(costos.costoInsumosProducto)}</span>
                  </div>
                  {costos.costoEmpaqueEntero > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Empaque producto</span>
                      <span className="text-white">{formatCurrency(costos.costoEmpaqueEntero)}</span>
                    </div>
                  )}
                  {costos.costoEmpaqueUnidad > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Empaque/porcion &times; {costos.unidades}</span>
                      <span className="text-white">{formatCurrency(costos.costoEmpaqueUnidad * costos.unidades)}</span>
                    </div>
                  )}
                  <div className="border-t border-zinc-800 pt-3 flex justify-between text-sm font-semibold">
                    <span className="text-zinc-300">Costo neto (producto)</span>
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

                {/* Pricing - Producto entero */}
                <div className="space-y-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Producto entero</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Precio venta</span>
                    <span className="text-white">{formatCurrency(costos.precioVenta)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">IGV ({costos.igvRate}%)</span>
                    <span className="text-white">{formatCurrency(costos.igvMonto)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-300 font-semibold">Precio final</span>
                    <span className="text-2xl font-bold text-[#FA7B21]">{formatCurrency(costos.precioFinal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-500 text-xs">Sugerido</span>
                    <span className="text-lg font-semibold text-green-400">{formatCurrency(precioComercial(costos.precioFinal))}</span>
                  </div>
                </div>

                {/* Pricing - Por porcion */}
                <div className="border-t border-zinc-800 pt-4 space-y-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Por porcion (1/{costos.unidades})</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Costo</span>
                    <span className="text-white">{formatCurrency(costos.costoNetoPorcion)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-300 font-semibold">Precio final</span>
                    <span className="text-lg font-bold text-[#FA7B21]">{formatCurrency(costos.precioFinalPorcion)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-500 text-xs">Sugerido</span>
                    <span className="text-sm font-semibold text-green-400">{formatCurrency(precioComercial(costos.precioFinalPorcion))}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                    <span className="text-2xl font-bold text-[#FA7B21]">{formatCurrency(costos.precioFinal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="text-zinc-500 text-xs">Sugerido</span>
                    <span className="text-lg font-semibold text-green-400">{formatCurrency(precioComercial(costos.precioFinal))}</span>
                  </div>
                </div>
              </>
            )}

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
