import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCalculadorCostos } from '../hooks/useCalculadorCostos';
import { cx } from '../styles/tokens';
import { formatCurrency, precioComercial } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import CustomSelect from '../components/CustomSelect';
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  BookmarkPlus,
} from 'lucide-react';

function normU(u) {
  if (!u) return '';
  if (u === 'l') return 'L';
  return u;
}

const FACTORES = {
  'g→kg': 0.001, 'kg→g': 1000,
  'g→oz': 0.03527, 'oz→g': 28.3495,
  'kg→oz': 35.274, 'oz→kg': 0.02835,
  'ml→L': 0.001, 'L→ml': 1000,
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
    ['uni'],
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
  const factor = convertirUnidad(1, uso, original);
  return factor > 0 ? (Number(ins.costo_unitario) || 0) * factor : (Number(ins.costo_unitario) || 0);
}

function InfoTip({ text }) {
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <span className="w-4 h-4 rounded-full bg-stone-100 text-stone-400 text-[10px] font-bold inline-flex items-center justify-center group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-stone-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-56 text-center z-50 leading-relaxed">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-stone-800" />
      </span>
    </span>
  );
}

let tempId = 0;
const newTempId = () => `temp-${++tempId}`;

const emptyInsumoRow = () => ({
  _id: newTempId(),
  insumo_id: null,
  nombre: '',
  cantidad: '',
  costo_unitario: 0,
  uso_unidad: '',
});

const emptyPreparacion = () => ({
  _id: newTempId(),
  nombre: '',
  capacidad: '',
  unidad: '',
  cantidad_por_unidad: '',
  porcion_unidad: '',
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
  const [margenPorcion, setMargenPorcion] = useState(50);
  // igv_rate in DB is decimal (0.18), hook expects integer (18)
  const [igvRate, setIgvRate] = useState(user?.igv_rate ? parseFloat((user.igv_rate * 100).toFixed(2)) : 18);
  const [tipoPresentacion, setTipoPresentacion] = useState('unidad');
  const [unidadesPorProducto, setUnidadesPorProducto] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!id);

  const [catalogInsumos, setCatalogInsumos] = useState([]);
  const [catalogMateriales, setCatalogMateriales] = useState([]);
  const [catalogPreps, setCatalogPreps] = useState([]);
  const [catalogEmpaques, setCatalogEmpaques] = useState([]);

  const costos = useCalculadorCostos(preparaciones, materiales, margen, igvRate, tipoPresentacion, unidadesPorProducto, margenPorcion);

  const enrichedInsumos = useMemo(() => {
    // Group by normalized name
    const groups = {};
    catalogInsumos.forEach((ins) => {
      const key = (ins.nombre || '').toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(ins);
    });

    // Find cheapest per group (cost per base unit)
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

    // Enrich with display info
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

  // Load catalogs
  useEffect(() => {
    api.get('/insumos').then((d) => setCatalogInsumos(d.data || [])).catch(() => {});
    api.get('/materiales').then((d) => setCatalogMateriales(d.data || [])).catch(() => {});
    api.get('/predeterminados/preparaciones').then((d) => setCatalogPreps(d.data || [])).catch(() => {});
    api.get('/predeterminados/empaques').then((d) => setCatalogEmpaques(d.data || [])).catch(() => {});
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
        setMargenPorcion(p.margen_porcion ? Math.round(p.margen_porcion * 100) : (p.margen ? Math.round(p.margen * 100) : 50));
        setIgvRate(p.igv_rate ? parseFloat((p.igv_rate * 100).toFixed(2)) : (user?.igv_rate ? parseFloat((user.igv_rate * 100).toFixed(2)) : 18));

        if (p.preparaciones?.length) {
          setPreparaciones(
            p.preparaciones.map((prep) => ({
              _id: newTempId(),
              id: prep.id,
              nombre: prep.nombre || '',
              capacidad: parseFloat(prep.capacidad) || '',
              unidad: prep.unidad_capacidad || prep.unidad || '',
              cantidad_por_unidad: parseFloat(prep.cantidad_por_unidad) || '',
              porcion_unidad: prep.porcion_unidad || prep.unidad_capacidad || prep.unidad || '',
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
                  uso_unidad: ins.uso_unidad || ins.unidad_medida || '',
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
          uso_unidad: ins.uso_unidad || ins.unidad_medida || '',
          cantidad: parseFloat(ins.cantidad) || '',
          costo_unitario: cu,
        };
      }),
    };
    setPreparaciones((prev) => [...prev, newPrep]);
  };

  const saveAsPredeterminada = async (prep) => {
    if (!prep.nombre) {
      toast.error('Dale un nombre a la preparacion primero');
      return;
    }
    try {
      await api.post('/predeterminados/preparaciones', {
        nombre: prep.nombre,
        capacidad: prep.capacidad || null,
        unidad: prep.unidad || null,
        insumos: (prep.insumos || [])
          .filter((i) => i.insumo_id)
          .map((i) => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) || 0, uso_unidad: i.uso_unidad || i.unidad_medida || null })),
      });
      toast.success(`"${prep.nombre}" guardada como predeterminada`);
      api.get('/predeterminados/preparaciones').then((d) => setCatalogPreps(d.data || [])).catch(() => {});
    } catch (err) {
      toast.error(err.message || 'Error guardando preparacion');
    }
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
      nombre: catalogItem._originalNombre || catalogItem.nombre,
      costo_unitario: costoUnit,
      unidad_medida: catalogItem.unidad_medida,
      uso_unidad: catalogItem.unidad_medida,
    });
  };

  // --- Material handlers ---
  const addMaterial = (tipo = 'entero') => {
    setMateriales((prev) => [...prev, emptyMaterial(tipo)]);
  };

  const loadEmpaquePred = (pred, tipo = 'entero') => {
    const newMats = (pred.materiales || []).map((mat) => {
      const precio = Number(mat.cantidad_presentacion) > 0
        ? Number(mat.precio_presentacion) / Number(mat.cantidad_presentacion)
        : 0;
      return {
        _id: newTempId(),
        material_id: mat.material_id,
        nombre: mat.nombre || '',
        unidad_medida: mat.unidad_medida || '',
        cantidad: parseFloat(mat.cantidad) || 1,
        precio,
        empaque_tipo: tipo,
      };
    });
    setMateriales((prev) => [...prev, ...newMats]);
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
    setMargenPorcion(50);
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
        margen_porcion: margenPorcion,
        igv_rate: igvRate / 100,
        tipo_presentacion: tipoPresentacion,
        unidades_por_producto: tipoPresentacion === 'entero' ? unidadesPorProducto : 1,
        preparaciones: preparaciones.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          capacidad: p.capacidad,
          unidad: p.unidad,
          cantidad_por_unidad: Number(p.cantidad_por_unidad) || null,
          porcion_unidad: p.porcion_unidad || p.unidad || null,
          insumos: p.insumos
            .filter((i) => i.insumo_id)
            .map((i) => ({
              id: i.id,
              insumo_id: i.insumo_id,
              cantidad: Number(i.cantidad) || 0,
              uso_unidad: i.uso_unidad || i.unidad_medida || null,
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
      (s, i) => s + costoEnUsoUnidad(i) * (Number(i.cantidad) || 0),
      0
    );
  }, []);

  // Helper to render a list of materials (mobile cards + desktop table)
  const renderMaterialsList = (mats) => {
    if (mats.length === 0) {
      return <p className="text-stone-400 text-sm text-center py-2">Sin materiales.</p>;
    }
    return (
      <div className={`${cx.card} p-4`}>
        {/* Mobile material cards */}
        <div className="space-y-3 lg:hidden">
          {mats.map((mat) => (
            <div key={mat._id} className="bg-stone-100 rounded-xl p-3 space-y-2">
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
                  className="w-full max-w-[7rem] bg-white rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
                />
                <span className="text-stone-400 text-xs">{mat.unidad_medida || ''}</span>
                <span className="text-stone-400 text-xs">x {formatCurrency(mat.precio)}</span>
                <span className="ml-auto text-stone-800 text-sm font-medium">
                  {formatCurrency((Number(mat.precio) || 0) * (Number(mat.cantidad) || 0))}
                </span>
                <button onClick={() => removeMaterial(mat._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
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
              <th className={cx.th + ' w-1/3'}>Material</th>
              <th className={cx.th + ' w-1/5'}>Cantidad</th>
              <th className={cx.th + ' w-1/6'}>Precio Unit.</th>
              <th className={cx.th + ' w-1/6 text-right'}>Subtotal</th>
              <th className={cx.th + ' w-10'}></th>
            </tr>
          </thead>
          <tbody>
            {mats.map((mat) => (
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
                      className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
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

  // Compute available predeterminadas for prep template selector
  const availablePreps = useMemo(() => {
    if (catalogPreps.length === 0) return [];
    const usedNames = new Set(preparaciones.map((p) => (p.nombre || '').toLowerCase()));
    return catalogPreps.filter((p) => !usedNames.has((p.nombre || '').toLowerCase()));
  }, [catalogPreps, preparaciones]);

  return (
    <div className="max-w-7xl mx-auto overflow-x-hidden">
      {/* Page header — clean, Apple-style */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-stone-900">
          {id ? 'Editar producto' : 'Nuevo producto'}
        </h1>
        <button onClick={handleReset} className={cx.btnGhost + ' flex items-center gap-1.5'}>
          <RotateCcw size={14} /> Vaciar
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left column: main form */}
        <div className="xl:col-span-2 space-y-8">

          {/* ── Producto ── */}
          <div>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Producto<InfoTip text="Define el nombre y tipo de presentacion. Si vendes un producto entero (torta, pie), indica cuantas porciones tiene." /></h3>
            <div className={`${cx.card} p-6`}>
              <div className={`grid gap-4 grid-cols-1 ${tipoPresentacion === 'entero' ? 'sm:grid-cols-[9fr_7fr_4fr]' : 'sm:grid-cols-[3fr_2fr]'}`}>
                <div>
                  <label className={cx.label}>Nombre del producto</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={cx.input} placeholder="Ej: Cheesecake de fresa" autoFocus />
                </div>
                <div>
                  <label className={cx.label}>Presentacion<InfoTip text="'Por unidad' si vendes items individuales. 'Presentacion entera' si vendes algo divisible (torta, bandeja, etc)." /></label>
                  <CustomSelect
                    value={tipoPresentacion}
                    onChange={setTipoPresentacion}
                    options={[
                      { value: 'unidad', label: 'Por unidad' },
                      { value: 'entero', label: 'Presentacion entera' },
                    ]}
                  />
                </div>
                {tipoPresentacion === 'entero' && (
                  <div>
                    <label className={cx.label}>Porciones</label>
                    <input type="number" min="1" value={unidadesPorProducto} onChange={(e) => setUnidadesPorProducto(Math.max(1, parseInt(e.target.value) || 1))} className={cx.input} />
                  </div>
                )}
              </div>
              {/* Imagen URL as small icon toggle — hidden by default, shown inline */}
              {imagenUrl ? (
                <div className="mt-4 flex items-center gap-2">
                  <ImageIcon size={14} className="text-stone-400" />
                  <input type="text" value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} className={cx.input + ' flex-1 text-xs'} placeholder="URL de imagen..." />
                  <button onClick={() => setImagenUrl('')} className={cx.btnIcon + ' hover:text-rose-500'} title="Quitar imagen">
                    <Trash2 size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setImagenUrl(' ')} className="mt-3 text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors">
                  <ImageIcon size={13} /> Agregar imagen
                </button>
              )}
            </div>
          </div>

          {/* ── Preparaciones — Airbnb accordion ── */}
          <div>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Preparaciones<InfoTip text="Cada preparacion es una receta base (masa, relleno, crema). Indica cuanto rinde en total. Puedes cargar plantillas guardadas previamente." /></h3>

            {/* Single card with divide-y for all preps */}
            <div className={`${cx.card} divide-y divide-stone-100`}>
              {preparaciones.map((prep) => (
                <div key={prep._id} className="p-5">
                  {/* Header row — click to collapse */}
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleCollapse(prep._id)}>
                    <div className="flex items-center gap-3">
                      {prep.collapsed ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronUp size={16} className="text-stone-400" />}
                      <div>
                        <span className="text-sm font-semibold text-stone-800">{prep.nombre || 'Nueva preparacion'}</span>
                        {prep.capacidad && <span className="text-xs text-stone-400 ml-2">Rinde {prep.capacidad} {prep.unidad}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--accent)]">{formatCurrency(prepSubtotal(prep))}</span>
                      <button onClick={(e) => { e.stopPropagation(); saveAsPredeterminada(prep); }} className={cx.btnIcon + ' hover:text-[var(--success)]'} title="Guardar como plantilla">
                        <BookmarkPlus size={14} />
                      </button>
                      {preparaciones.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); removePreparacion(prep._id); }} className={cx.btnIcon + ' hover:text-rose-500'}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {!prep.collapsed && (
                    <div className="mt-4 space-y-4">
                      {/* Name + rendimiento row */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <label className={cx.label}>Nombre</label>
                          <input type="text" value={prep.nombre} onChange={(e) => updatePreparacion(prep._id, 'nombre', e.target.value)} placeholder="Ej: Masa galleta" className={cx.input} />
                        </div>
                        <div>
                          <label className={cx.label}>Rendimiento</label>
                          <input type="number" value={prep.capacidad} onChange={(e) => updatePreparacion(prep._id, 'capacidad', e.target.value)} placeholder="500" className={cx.input} />
                        </div>
                        <div>
                          <label className={cx.label}>Unidad</label>
                          <CustomSelect
                            value={prep.unidad}
                            onChange={(v) => updatePreparacion(prep._id, 'unidad', v)}
                            options={[
                              { value: '', label: '--' },
                              { value: 'g', label: 'g' },
                              { value: 'kg', label: 'kg' },
                              { value: 'ml', label: 'ml' },
                              { value: 'L', label: 'L' },
                              { value: 'uni', label: 'uni' },
                              { value: 'oz', label: 'oz' },
                            ]}
                            placeholder="--"
                          />
                        </div>
                      </div>

                      {/* Insumos — mobile cards */}
                      <div className="space-y-3 lg:hidden">
                        {prep.insumos.map((ins) => (
                          <div key={ins._id} className="bg-stone-50 rounded-xl p-3 space-y-2">
                            <SearchableSelect
                              options={enrichedInsumos}
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
                                className="w-full max-w-[7rem] bg-white rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
                              />
                              <CustomSelect
                                value={ins.uso_unidad || ins.unidad_medida || ''}
                                onChange={(v) => updateInsumo(prep._id, ins._id, { uso_unidad: v })}
                                options={getUnidadesCompatibles(ins.unidad_medida).map(u => ({ value: u, label: u }))}
                                compact className="w-14"
                              />
                              <span className="text-stone-400 text-xs">x {formatCurrency(costoEnUsoUnidad(ins))}</span>
                              <span className="ml-auto text-stone-800 text-sm font-medium">
                                {formatCurrency(costoEnUsoUnidad(ins) * (Number(ins.cantidad) || 0))}
                              </span>
                              <button onClick={() => removeInsumo(prep._id, ins._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Insumos — desktop table */}
                      <table className="w-full hidden lg:table">
                        <thead>
                          <tr>
                            <th className={cx.th + ' w-1/3'}>Insumo</th>
                            <th className={cx.th + ' w-1/5'}>Cantidad</th>
                            <th className={cx.th + ' w-1/6'}>Costo Unit.</th>
                            <th className={cx.th + ' w-1/6 text-right'}>Subtotal</th>
                            <th className={cx.th + ' w-10'}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {prep.insumos.map((ins) => (
                            <tr key={ins._id} className="border-b border-stone-100 last:border-0">
                              <td className="py-2 pr-2">
                                <SearchableSelect
                                  options={enrichedInsumos}
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
                                    className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
                                  />
                                  <CustomSelect
                                    value={ins.uso_unidad || ins.unidad_medida || ''}
                                    onChange={(v) => updateInsumo(prep._id, ins._id, { uso_unidad: v })}
                                    options={getUnidadesCompatibles(ins.unidad_medida).map(u => ({ value: u, label: u }))}
                                    compact className="w-14"
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
                                <button onClick={() => removeInsumo(prep._id, ins._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <button
                        onClick={() => addInsumo(prep._id)}
                        className={cx.btnGhost + ' mt-1 flex items-center gap-1 text-xs'}
                      >
                        <Plus size={13} /> Agregar insumo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add prep buttons — below the card */}
            <div className="flex items-center gap-3 mt-3">
              {catalogPreps.length > 0 && availablePreps.length > 0 && (
                <div className="w-48">
                  <SearchableSelect
                    options={availablePreps}
                    value={null}
                    onChange={(pred) => loadPredeterminada(pred)}
                    placeholder="Usar plantilla..."
                    displayKey="nombre"
                    valueKey="id"
                  />
                </div>
              )}
              <button onClick={addPreparacion} className={cx.btnGhost + ' flex items-center gap-1.5'}>
                <Plus size={14} /> Nueva preparacion
              </button>
            </div>
          </div>

          {/* ── Composicion del producto — light bg section ── */}
          <div>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Composicion del producto<InfoTip text="Indica cuantos gramos/ml de cada preparacion necesitas para hacer UN producto completo. El sistema calculara automaticamente cuantos productos puedes hacer por tanda y el costo." /></h3>
            <div className="bg-stone-50 rounded-xl p-5">
              {preparaciones.filter(p => p.nombre).length === 0 ? (
                <p className="text-stone-400 text-sm text-center py-4">Agrega preparaciones arriba para definir la composicion.</p>
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
                        const costoPrep = (prep.insumos || []).reduce((s, i) => s + costoEnUsoUnidad(i) * (Number(i.cantidad) || 0), 0);
                        const rendimiento = Number(prep.capacidad) || 0;
                        const cantPorUni = Number(prep.cantidad_por_unidad) || 0;
                        const cantEnUnidadPrep = convertirUnidad(cantPorUni, prep.porcion_unidad || prep.unidad, prep.unidad);
                        const alcanzaPara = rendimiento > 0 && cantEnUnidadPrep > 0 ? Math.floor(rendimiento / cantEnUnidadPrep) : 0;
                        const costoPorUni = rendimiento > 0 && cantEnUnidadPrep > 0 ? (costoPrep / rendimiento) * cantEnUnidadPrep : costoPrep;
                        return (
                          <tr key={prep._id} className="border-b border-stone-200/50 last:border-0">
                            <td className={cx.td + ' text-stone-800 font-medium'}>{prep.nombre}</td>
                            <td className={cx.td + ' text-stone-500'}>{rendimiento > 0 ? `${rendimiento} ${prep.unidad || ''}` : '--'}</td>
                            <td className={cx.td}>
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" step="0.01" value={prep.cantidad_por_unidad} onChange={(e) => updatePreparacion(prep._id, 'cantidad_por_unidad', e.target.value)} className={cx.input + ' w-full text-center'} placeholder="0" />
                                <CustomSelect
                                  value={prep.porcion_unidad || prep.unidad || ''}
                                  onChange={(v) => updatePreparacion(prep._id, 'porcion_unidad', v)}
                                  options={[
                                    { value: 'g', label: 'g' },
                                    { value: 'kg', label: 'kg' },
                                    { value: 'ml', label: 'ml' },
                                    { value: 'L', label: 'L' },
                                    { value: 'uni', label: 'uni' },
                                    { value: 'oz', label: 'oz' },
                                  ]}
                                  compact className="w-14"
                                />
                              </div>
                            </td>
                            <td className={cx.td + ' text-stone-600'}>{alcanzaPara > 0 ? `${alcanzaPara} productos` : '--'}</td>
                            <td className={cx.td + ' text-right text-[var(--accent)] font-semibold'}>{formatCurrency(costoPorUni)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {preparaciones.filter(p => p.nombre).map((prep) => {
                      const costoPrep = (prep.insumos || []).reduce((s, i) => s + costoEnUsoUnidad(i) * (Number(i.cantidad) || 0), 0);
                      const rendimiento = Number(prep.capacidad) || 0;
                      const cantPorUni = Number(prep.cantidad_por_unidad) || 0;
                      const cantEnUnidadPrep = convertirUnidad(cantPorUni, prep.porcion_unidad || prep.unidad, prep.unidad);
                      const alcanzaPara = rendimiento > 0 && cantEnUnidadPrep > 0 ? Math.floor(rendimiento / cantEnUnidadPrep) : 0;
                      const costoPorUni = rendimiento > 0 && cantEnUnidadPrep > 0 ? (costoPrep / rendimiento) * cantEnUnidadPrep : costoPrep;
                      return (
                        <div key={prep._id} className="bg-white rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-stone-800 text-sm font-medium">{prep.nombre}</span>
                            <span className="text-stone-500 text-xs">{rendimiento > 0 ? `Rinde: ${rendimiento} ${prep.unidad || ''}` : ''}</span>
                          </div>
                          <div className="flex gap-3 items-center">
                            <div>
                              <label className={cx.label}>Para el producto</label>
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" step="0.01" value={prep.cantidad_por_unidad} onChange={(e) => updatePreparacion(prep._id, 'cantidad_por_unidad', e.target.value)} className="w-full max-w-[7rem] bg-white rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30" placeholder="0" />
                                <CustomSelect
                                  value={prep.porcion_unidad || prep.unidad || ''}
                                  onChange={(v) => updatePreparacion(prep._id, 'porcion_unidad', v)}
                                  options={[
                                    { value: 'g', label: 'g' },
                                    { value: 'kg', label: 'kg' },
                                    { value: 'ml', label: 'ml' },
                                    { value: 'L', label: 'L' },
                                    { value: 'uni', label: 'uni' },
                                    { value: 'oz', label: 'oz' },
                                  ]}
                                  compact className="w-14"
                                />
                              </div>
                            </div>
                            <div className="text-xs text-stone-500">
                              {alcanzaPara > 0 && <p>{alcanzaPara} productos/tanda</p>}
                              <p className="text-[var(--accent)] font-semibold">{formatCurrency(costoPorUni)}</p>
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

          {/* ── Empaque / Materiales ── */}
          <div>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Empaque<InfoTip text="Materiales de empaque para presentar tu producto. Si es presentacion entera, separa el empaque del producto completo y el de cada porcion individual." /></h3>

            {tipoPresentacion === 'entero' ? (
              <div className="space-y-5">
                {/* Empaque producto entero */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Producto entero</p>
                    <div className="flex items-center gap-2">
                      {catalogEmpaques.length > 0 && (
                        <div className="w-40">
                          <SearchableSelect options={catalogEmpaques} value={null} onChange={(pred) => loadEmpaquePred(pred, 'entero')} placeholder="Plantilla..." />
                        </div>
                      )}
                      <button onClick={() => addMaterial('entero')} className={cx.btnGhost + ' flex items-center gap-1 text-xs'}>
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                  </div>
                  {renderMaterialsList(materiales.filter(m => (m.empaque_tipo || 'entero') === 'entero'))}
                </div>

                {/* Empaque por unidad */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Por porcion ({unidadesPorProducto} uni)</p>
                    <div className="flex items-center gap-2">
                      {catalogEmpaques.length > 0 && (
                        <div className="w-40">
                          <SearchableSelect options={catalogEmpaques} value={null} onChange={(pred) => loadEmpaquePred(pred, 'unidad')} placeholder="Plantilla..." />
                        </div>
                      )}
                      <button onClick={() => addMaterial('unidad')} className={cx.btnGhost + ' flex items-center gap-1 text-xs'}>
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                  </div>
                  {renderMaterialsList(materiales.filter(m => m.empaque_tipo === 'unidad'))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span />
                  <div className="flex items-center gap-2">
                    {catalogEmpaques.length > 0 && (
                      <div className="w-44">
                        <SearchableSelect options={catalogEmpaques} value={null} onChange={(pred) => loadEmpaquePred(pred, 'entero')} placeholder="Cargar plantilla..." />
                      </div>
                    )}
                    <button onClick={() => addMaterial('entero')} className={cx.btnGhost + ' flex items-center gap-1'}>
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                </div>
                {materiales.length > 0 ? (
                  renderMaterialsList(materiales)
                ) : (
                  <div className={`${cx.card} p-8 text-center`}>
                    <p className="text-stone-400 text-sm">Sin materiales de empaque.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right column: Resumen — premium sticky card ── */}
        <div className="xl:col-span-1">
          <div className={`${cx.card} p-6 xl:sticky xl:top-6`}>
            <h3 className="text-lg font-semibold text-stone-900 mb-5">Resumen<InfoTip text="El costo neto incluye insumos + empaque. El margen define tu ganancia. El precio sugerido redondea a un valor comercial (.90 o .00)." /></h3>

            {tipoPresentacion === 'entero' ? (
              <>
                {/* Cost lines */}
                <div className="space-y-3 pb-4 border-b border-stone-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Costo insumos</span>
                    <span className="text-stone-800 font-medium">{formatCurrency(costos.costoInsumosProducto)}</span>
                  </div>
                  {costos.costoEmpaqueEntero > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Empaque producto</span>
                      <span className="text-stone-800 font-medium">{formatCurrency(costos.costoEmpaqueEntero)}</span>
                    </div>
                  )}
                  {costos.costoEmpaqueUnidad > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Empaque/porcion &times; {costos.unidades}</span>
                      <span className="text-stone-800 font-medium">{formatCurrency(costos.costoEmpaqueUnidad * costos.unidades)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold pt-2">
                    <span className="text-stone-600">Costo neto</span>
                    <span className="text-stone-800">{formatCurrency(costos.costoNeto)}</span>
                  </div>
                </div>

                {/* Margen slider - producto entero */}
                <div className="py-4 border-b border-stone-100">
                  <label className={cx.label}>Margen producto entero</label>
                  <div className="flex items-center gap-3 mt-1">
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="1"
                      value={margen}
                      onChange={(e) => setMargen(Number(e.target.value))}
                      className="flex-1 accent-[var(--accent)] h-1.5"
                    />
                    <input
                      type="number"
                      value={margen}
                      onChange={(e) => setMargen(Math.min(90, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-20 bg-stone-50 rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
                    />
                    <span className="text-stone-400 text-sm">%</span>
                  </div>
                </div>

                {/* Pricing - Producto entero */}
                <div className="py-4 border-b border-stone-100 space-y-2">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Producto entero</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Precio venta</span>
                    <span className="text-stone-800">{formatCurrency(costos.precioVenta)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">IGV</span>
                    <span className="text-stone-800">
                      {user?.tipo_negocio === 'informal' ? 'No aplica' : `${formatCurrency(costos.igvMonto)} (${costos.igvRate}%)`}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-stone-600 text-sm">Precio final</span>
                    <span className="text-2xl font-bold text-stone-900">{formatCurrency(costos.precioFinal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-stone-400 text-xs">Sugerido</span>
                    <span className="text-base font-semibold text-[var(--success)]">{formatCurrency(precioComercial(costos.precioFinal))}</span>
                  </div>
                </div>

                {/* Margen por porcion */}
                <div className="py-4 border-b border-stone-100">
                  <label className={cx.label}>Margen por porcion</label>
                  <div className="flex items-center gap-3 mt-1">
                    <input type="range" min="0" max="90" step="1" value={margenPorcion} onChange={(e) => setMargenPorcion(Number(e.target.value))} className="flex-1 accent-[var(--accent)] h-1.5" />
                    <input type="number" value={margenPorcion} onChange={(e) => setMargenPorcion(Math.min(90, Math.max(0, Number(e.target.value) || 0)))} className="w-20 bg-stone-50 rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400" />
                    <span className="text-stone-400 text-sm">%</span>
                  </div>
                </div>

                {/* Pricing - Por porcion */}
                <div className="pt-4 space-y-2">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Por porcion (1/{costos.unidades})</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Costo</span>
                    <span className="text-stone-800">{formatCurrency(costos.costoNetoPorcion)}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-stone-600 text-sm">Precio final</span>
                    <span className="text-2xl font-bold text-stone-900">{formatCurrency(costos.precioFinalPorcion)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-stone-400 text-xs">Sugerido</span>
                    <span className="text-base font-semibold text-[var(--success)]">{formatCurrency(precioComercial(costos.precioFinalPorcion))}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 pb-4 border-b border-stone-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Costo insumos</span>
                    <span className="text-stone-800 font-medium">{formatCurrency(costos.costoInsumos)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Costo empaque</span>
                    <span className="text-stone-800 font-medium">{formatCurrency(costos.costoEmpaque)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-2">
                    <span className="text-stone-600">Costo neto</span>
                    <span className="text-stone-800">{formatCurrency(costos.costoNeto)}</span>
                  </div>
                </div>

                {/* Margen slider */}
                <div className="py-4 border-b border-stone-100">
                  <label className={cx.label}>Margen</label>
                  <div className="flex items-center gap-3 mt-1">
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="1"
                      value={margen}
                      onChange={(e) => setMargen(Number(e.target.value))}
                      className="flex-1 accent-[var(--accent)] h-1.5"
                    />
                    <input
                      type="number"
                      value={margen}
                      onChange={(e) => setMargen(Math.min(90, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-20 bg-stone-50 rounded-lg px-3 py-2.5 text-stone-800 text-sm text-center border border-stone-200 focus:outline-none focus:border-stone-400"
                    />
                    <span className="text-stone-400 text-sm">%</span>
                  </div>
                </div>

                <div className="py-4 border-b border-stone-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Precio de venta</span>
                    <span className="text-stone-800 font-medium">{formatCurrency(costos.precioVenta)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">IGV</span>
                    <span className="text-stone-800">
                      {user?.tipo_negocio === 'informal' ? 'No aplica' : `${formatCurrency(costos.igvMonto)} (${costos.igvRate}%)`}
                    </span>
                  </div>
                </div>

                {/* Final price — BIG, prominent */}
                <div className="pt-4">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-stone-600 text-sm">Precio final</span>
                    <span className="text-2xl font-bold text-stone-900">{formatCurrency(costos.precioFinal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-stone-400 text-xs">Sugerido</span>
                    <span className="text-base font-semibold text-[var(--success)]">{formatCurrency(precioComercial(costos.precioFinal))}</span>
                  </div>
                </div>
              </>
            )}

            {/* Save button — full width, prominent */}
            <button
              onClick={handleSave}
              disabled={saving}
              className={cx.btnPrimary + ' w-full mt-5 py-3 text-sm flex items-center justify-center gap-2'}
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
