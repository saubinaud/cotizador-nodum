import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import {
  Plus, Trash2, TrendingDown, AlertTriangle,
  Salad, ChefHat, Package, BoxSelect, X, Inbox,
} from 'lucide-react';
import { useTerminos } from '../context/TerminosContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const CAUSAS_DESMEDRO = {
  productos: ['quemado', 'partido', 'caído', 'vencido', 'mal acabado', 'otro'],
  preparaciones: ['vencimiento', 'cortada', 'no subió', 'contaminada', 'otro'],
  insumos: ['vencimiento', 'contaminación', 'plagas', 'humedad', 'otro'],
  materiales: ['daño en transporte', 'impresión defectuosa', 'rotura', 'vencimiento', 'otro'],
};

const MERMA_PLACEHOLDERS = {
  causa: 'cáscara, residuo en envase, adherencia en bol...',
};

export default function PerdidasPage() {
  const api = useApi();
  const toast = useToast();
  const { user } = useAuth();
  const t = useTerminos();

  const [mainTab, setMainTab] = useState('mermas');
  const [subTab, setSubTab] = useState('insumos');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [catalogos, setCatalogos] = useState({ insumos: [], preparaciones: [], productos: [], materiales: [] });

  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState('');

  const [resumen, setResumen] = useState(null);
  const [mermaStats, setMermaStats] = useState({ count: 0, avgPct: 0 });

  // --- Load catalogs and periodos on mount ---
  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [catsRes, prodsRes, persRes] = await Promise.all([
          api.get('/productos/catalogs'),
          api.get('/productos'),
          api.get('/pl/periodos'),
        ]);
        const cats = catsRes.data || catsRes;
        const prods = prodsRes.data || prodsRes;
        const pers = persRes.data || persRes;
        setCatalogos({
          insumos: (cats.insumos || []).map(i => ({ value: i.id, label: i.nombre, costo: parseFloat(i.costo_base) || (parseFloat(i.precio_presentacion) / parseFloat(i.cantidad_presentacion)) || 0 })),
          preparaciones: (cats.preparaciones_pred || []).map(p => ({ value: p.id, label: p.nombre })),
          productos: (prods || []).map(p => ({ value: p.id, label: p.nombre, costo: parseFloat(p.costo_neto) || 0 })),
          materiales: (cats.materiales || []).map(m => ({ value: m.id, label: m.nombre, costo: parseFloat(m.precio_presentacion) / parseFloat(m.cantidad_presentacion) || 0 })),
        });
        const periodosList = Array.isArray(pers) ? pers : [];
        setPeriodos(periodosList.map(p => ({ value: p.id, label: p.nombre })));
        if (periodosList.length > 0) setPeriodoId(periodosList[0].id);
      } catch (e) {
        toast.error('Error cargando catálogos');
      }
    }
    loadCatalogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Load items ---
  async function loadItems() {
    if (mainTab === 'desmedros' && !periodoId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const base = `/perdidas/${mainTab}/${subTab}`;
      const path = mainTab === 'desmedros' && periodoId ? `${base}?periodo_id=${periodoId}` : base;
      const res = await api.get(path);
      const arr = res.data || res || [];
      setItems(Array.isArray(arr) ? arr : []);

      if (mainTab === 'mermas') {
        const pcts = (Array.isArray(arr) ? arr : []).map(i => Number(i.merma_pct || 0)).filter(v => !isNaN(v));
        setMermaStats({
          count: (Array.isArray(arr) ? arr : []).length,
          avgPct: pcts.length > 0 ? (pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
        });
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, [mainTab, subTab, periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Load desmedro resumen ---
  useEffect(() => {
    if (mainTab !== 'desmedros' || !periodoId) { setResumen(null); return; }
    api.get(`/perdidas/desmedros/resumen?periodo_id=${periodoId}`)
      .then(res => setResumen(res.data || res))
      .catch(() => setResumen(null));
  }, [mainTab, periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Open form ---
  const openForm = () => {
    setForm({ fecha: todayStr(), causa: '', notas: '' });
    setShowForm(true);
  };

  // --- Submit form ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const path = `/perdidas/${mainTab}/${subTab}`;
      await api.post(path, form);
      toast.success('Registro guardado');
      setShowForm(false);
      loadItems();
    } catch (err) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (id) => {
    try {
      await api.del(`/perdidas/${mainTab}/${subTab}/${id}`);
      toast.success('Registro eliminado');
      loadItems();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // --- Helpers ---
  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const lookupCosto = (type, id) => {
    const cat = catalogos[type] || [];
    const item = cat.find(c => c.value === id);
    return item?.costo || 0;
  };

  // --- Tab definitions ---
  const subTabs = mainTab === 'mermas'
    ? [{ key: 'insumos', label: 'Insumos', icon: Salad }, { key: 'preparaciones', label: 'Preparaciones', icon: ChefHat }]
    : [{ key: 'productos', label: 'Productos', icon: Package }, { key: 'preparaciones', label: 'Preparaciones', icon: ChefHat }, { key: 'insumos', label: 'Insumos', icon: Salad }, { key: 'materiales', label: 'Materiales', icon: BoxSelect }];

  // --- Table columns ---
  const getColumns = () => {
    if (mainTab === 'mermas' && subTab === 'insumos') {
      return ['Insumo', '% Merma', 'Causa', 'Fecha', ''];
    }
    if (mainTab === 'mermas' && subTab === 'preparaciones') {
      return ['Preparación', 'Tanda (g/ml)', 'Útil', 'Descartada', '% Merma', 'Causa', 'Fecha', ''];
    }
    if (mainTab === 'desmedros' && subTab === 'productos') {
      return ['Producto', 'Unidades', 'Costo unit.', 'Pérdida total', 'Causa', 'Fecha', ''];
    }
    if (mainTab === 'desmedros' && subTab === 'preparaciones') {
      return ['Preparación', 'Costo tanda', 'Pérdida', 'Causa', 'Fecha', ''];
    }
    if (mainTab === 'desmedros' && subTab === 'insumos') {
      return ['Insumo', 'Cantidad', 'Costo unit.', 'Pérdida', 'Causa', 'Fecha', ''];
    }
    if (mainTab === 'desmedros' && subTab === 'materiales') {
      return ['Material', 'Cantidad', 'Costo unit.', 'Pérdida', 'Causa', 'Fecha', ''];
    }
    return [];
  };

  const renderRow = (item) => {
    const nombre = item.nombre || item.insumo_nombre || item.preparacion_nombre || item.producto_nombre || item.material_nombre || '-';

    if (mainTab === 'mermas' && subTab === 'insumos') {
      return (
        <tr key={item.id} className={cx.tr}>
          <td className={cx.td + ' font-medium text-stone-800'}>{nombre}</td>
          <td className={cx.td + ' text-amber-600 font-semibold'}>{Number(item.merma_pct || 0).toFixed(1)}%</td>
          <td className={cx.td + ' text-stone-600'}>{item.causa || '-'}</td>
          <td className={cx.td + ' text-stone-500'}>{formatDate(item.fecha)}</td>
          <td className={cx.td}>
            <button onClick={() => handleDelete(item.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
          </td>
        </tr>
      );
    }

    if (mainTab === 'mermas' && subTab === 'preparaciones') {
      const descartada = Number(item.tanda_producida || 0) - Number(item.cantidad_util || 0);
      return (
        <tr key={item.id} className={cx.tr}>
          <td className={cx.td + ' font-medium text-stone-800'}>{nombre}</td>
          <td className={cx.td}>{Number(item.tanda_producida || 0).toFixed(0)}</td>
          <td className={cx.td}>{Number(item.cantidad_util || 0).toFixed(0)}</td>
          <td className={cx.td}>{descartada.toFixed(0)}</td>
          <td className={cx.td + ' text-amber-600 font-semibold'}>{Number(item.merma_pct || 0).toFixed(1)}%</td>
          <td className={cx.td + ' text-stone-600'}>{item.causa || '-'}</td>
          <td className={cx.td + ' text-stone-500'}>{formatDate(item.fecha)}</td>
          <td className={cx.td}>
            <button onClick={() => handleDelete(item.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
          </td>
        </tr>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'productos') {
      const perdida = Number(item.unidades || 0) * Number(item.costo_unitario || 0);
      return (
        <tr key={item.id} className={cx.tr}>
          <td className={cx.td + ' font-medium text-stone-800'}>{nombre}</td>
          <td className={cx.td}>{item.unidades}</td>
          <td className={cx.td}>{formatCurrency(item.costo_unitario)}</td>
          <td className={cx.td + ' text-rose-600 font-semibold'}>{formatCurrency(item.perdida_total || perdida)}</td>
          <td className={cx.td + ' text-stone-600'}>{item.causa || '-'}</td>
          <td className={cx.td + ' text-stone-500'}>{formatDate(item.fecha)}</td>
          <td className={cx.td}>
            <button onClick={() => handleDelete(item.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
          </td>
        </tr>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'preparaciones') {
      return (
        <tr key={item.id} className={cx.tr}>
          <td className={cx.td + ' font-medium text-stone-800'}>{nombre}</td>
          <td className={cx.td}>{formatCurrency(item.costo_total_tanda)}</td>
          <td className={cx.td + ' text-rose-600 font-semibold'}>{formatCurrency(item.perdida || item.costo_total_tanda)}</td>
          <td className={cx.td + ' text-stone-600'}>{item.causa || '-'}</td>
          <td className={cx.td + ' text-stone-500'}>{formatDate(item.fecha)}</td>
          <td className={cx.td}>
            <button onClick={() => handleDelete(item.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
          </td>
        </tr>
      );
    }

    // desmedros insumos / materiales
    const perdida = Number(item.cantidad || 0) * Number(item.costo_unitario || 0);
    return (
      <tr key={item.id} className={cx.tr}>
        <td className={cx.td + ' font-medium text-stone-800'}>{nombre}</td>
        <td className={cx.td}>{item.cantidad}</td>
        <td className={cx.td}>{formatCurrency(item.costo_unitario)}</td>
        <td className={cx.td + ' text-rose-600 font-semibold'}>{formatCurrency(item.perdida || perdida)}</td>
        <td className={cx.td + ' text-stone-600'}>{item.causa || '-'}</td>
        <td className={cx.td + ' text-stone-500'}>{formatDate(item.fecha)}</td>
        <td className={cx.td}>
          <button onClick={() => handleDelete(item.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
        </td>
      </tr>
    );
  };

  // --- Form fields ---
  const renderFormFields = () => {
    if (mainTab === 'mermas' && subTab === 'insumos') {
      return (
        <>
          <div>
            <label className={cx.label}>Insumo</label>
            <CustomSelect
              options={catalogos.insumos}
              value={form.insumo_id || ''}
              onChange={(v) => updateForm('insumo_id', v)}
              placeholder="Seleccionar insumo..."
            />
          </div>
          <div>
            <label className={cx.label}>% Merma</label>
            <input type="number" step="0.1" min="0" max="100" className={cx.input}
              value={form.merma_pct || ''} onChange={(e) => updateForm('merma_pct', e.target.value)}
              placeholder="ej. 15" />
          </div>
          <div>
            <label className={cx.label}>Causa</label>
            <input type="text" className={cx.input}
              value={form.causa || ''} onChange={(e) => updateForm('causa', e.target.value)}
              placeholder={MERMA_PLACEHOLDERS.causa} />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    if (mainTab === 'mermas' && subTab === 'preparaciones') {
      const tanda = Number(form.tanda_producida || 0);
      const util = Number(form.cantidad_util || 0);
      const descartada = tanda > 0 ? tanda - util : 0;
      const mermaCalc = tanda > 0 ? ((descartada / tanda) * 100).toFixed(1) : '0.0';

      return (
        <>
          <div>
            <label className={cx.label}>Preparación</label>
            <CustomSelect
              options={catalogos.preparaciones}
              value={form.preparacion_pred_id || ''}
              onChange={(v) => updateForm('preparacion_pred_id', v)}
              placeholder="Seleccionar preparación..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cx.label}>Tanda producida (g/ml)</label>
              <input type="number" step="1" min="0" className={cx.input}
                value={form.tanda_producida || ''} onChange={(e) => updateForm('tanda_producida', e.target.value)} />
            </div>
            <div>
              <label className={cx.label}>Cantidad útil</label>
              <input type="number" step="1" min="0" className={cx.input}
                value={form.cantidad_util || ''} onChange={(e) => updateForm('cantidad_util', e.target.value)} />
            </div>
          </div>
          {tanda > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 rounded-lg text-sm">
              <span className="text-stone-500">Descartada: <span className="font-semibold text-stone-700">{descartada.toFixed(0)}</span></span>
              <span className="text-stone-300">|</span>
              <span className="text-stone-500">Merma: <span className="font-semibold text-[var(--accent)]">{mermaCalc}%</span></span>
            </div>
          )}
          <div>
            <label className={cx.label}>Causa</label>
            <input type="text" className={cx.input}
              value={form.causa || ''} onChange={(e) => updateForm('causa', e.target.value)}
              placeholder={MERMA_PLACEHOLDERS.causa} />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'productos') {
      const costoUnit = form.producto_id ? lookupCosto('productos', form.producto_id) : 0;
      const perdidaCalc = Number(form.unidades || 0) * costoUnit;

      return (
        <>
          <div>
            <label className={cx.label}>Producto</label>
            <CustomSelect
              options={catalogos.productos}
              value={form.producto_id || ''}
              onChange={(v) => {
                updateForm('producto_id', v);
                const c = lookupCosto('productos', v);
                updateForm('costo_unitario_snapshot', c);
              }}
              placeholder="Seleccionar producto..."
            />
          </div>
          <div>
            <label className={cx.label}>Unidades perdidas</label>
            <input type="number" step="1" min="1" className={cx.input}
              value={form.unidades || ''} onChange={(e) => updateForm('unidades', e.target.value)} />
          </div>
          {perdidaCalc > 0 && (
            <div className="px-3 py-2 bg-rose-50 rounded-lg text-sm text-rose-700">
              Pérdida estimada: <span className="font-semibold">{formatCurrency(perdidaCalc)}</span>
            </div>
          )}
          <div>
            <label className={cx.label}>Causa</label>
            <CustomSelect
              options={CAUSAS_DESMEDRO.productos.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              value={form.causa || ''}
              onChange={(v) => updateForm('causa', v)}
              placeholder="Seleccionar causa..."
            />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'preparaciones') {
      return (
        <>
          <div>
            <label className={cx.label}>Preparación</label>
            <CustomSelect
              options={catalogos.preparaciones}
              value={form.preparacion_pred_id || ''}
              onChange={(v) => updateForm('preparacion_pred_id', v)}
              placeholder="Seleccionar preparación..."
            />
          </div>
          <div>
            <label className={cx.label}>Costo total de la tanda</label>
            <input type="number" step="0.01" min="0" className={cx.input}
              value={form.costo_total_tanda || ''} onChange={(e) => updateForm('costo_total_tanda', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Causa</label>
            <CustomSelect
              options={CAUSAS_DESMEDRO.preparaciones.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              value={form.causa || ''}
              onChange={(v) => updateForm('causa', v)}
              placeholder="Seleccionar causa..."
            />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'insumos') {
      const costoUnit = form.insumo_id ? lookupCosto('insumos', form.insumo_id) : 0;
      const perdidaCalc = Number(form.cantidad || 0) * costoUnit;

      return (
        <>
          <div>
            <label className={cx.label}>Insumo</label>
            <CustomSelect
              options={catalogos.insumos}
              value={form.insumo_id || ''}
              onChange={(v) => {
                updateForm('insumo_id', v);
                const c = lookupCosto('insumos', v);
                updateForm('costo_unitario_snapshot', c);
              }}
              placeholder="Seleccionar insumo..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cx.label}>Cantidad</label>
              <input type="number" step="0.01" min="0" className={cx.input}
                value={form.cantidad || ''} onChange={(e) => updateForm('cantidad', e.target.value)} />
            </div>
            <div>
              <label className={cx.label}>Unidad</label>
              <input type="text" className={cx.input}
                value={form.unidad || ''} onChange={(e) => updateForm('unidad', e.target.value)}
                placeholder="kg, lt, unid..." />
            </div>
          </div>
          {perdidaCalc > 0 && (
            <div className="px-3 py-2 bg-rose-50 rounded-lg text-sm text-rose-700">
              Pérdida estimada: <span className="font-semibold">{formatCurrency(perdidaCalc)}</span>
            </div>
          )}
          <div>
            <label className={cx.label}>Causa</label>
            <CustomSelect
              options={CAUSAS_DESMEDRO.insumos.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              value={form.causa || ''}
              onChange={(v) => updateForm('causa', v)}
              placeholder="Seleccionar causa..."
            />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    if (mainTab === 'desmedros' && subTab === 'materiales') {
      const costoUnit = form.material_id ? lookupCosto('materiales', form.material_id) : 0;
      const perdidaCalc = Number(form.cantidad || 0) * costoUnit;

      return (
        <>
          <div>
            <label className={cx.label}>Material</label>
            <CustomSelect
              options={catalogos.materiales}
              value={form.material_id || ''}
              onChange={(v) => {
                updateForm('material_id', v);
                const c = lookupCosto('materiales', v);
                updateForm('costo_unitario_snapshot', c);
              }}
              placeholder="Seleccionar material..."
            />
          </div>
          <div>
            <label className={cx.label}>Cantidad</label>
            <input type="number" step="1" min="1" className={cx.input}
              value={form.cantidad || ''} onChange={(e) => updateForm('cantidad', e.target.value)} />
          </div>
          {perdidaCalc > 0 && (
            <div className="px-3 py-2 bg-rose-50 rounded-lg text-sm text-rose-700">
              Pérdida estimada: <span className="font-semibold">{formatCurrency(perdidaCalc)}</span>
            </div>
          )}
          <div>
            <label className={cx.label}>Causa</label>
            <CustomSelect
              options={CAUSAS_DESMEDRO.materiales.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              value={form.causa || ''}
              onChange={(v) => updateForm('causa', v)}
              placeholder="Seleccionar causa..."
            />
          </div>
          <div>
            <label className={cx.label}>Fecha</label>
            <input type="date" className={cx.input}
              value={form.fecha || ''} onChange={(e) => updateForm('fecha', e.target.value)} />
          </div>
          <div>
            <label className={cx.label}>Notas</label>
            <textarea className={cx.input + ' resize-none'} rows={2}
              value={form.notas || ''} onChange={(e) => updateForm('notas', e.target.value)}
              placeholder="Observaciones opcionales..." />
          </div>
        </>
      );
    }

    return null;
  };

  // --- Render ---
  const columns = getColumns();
  const formTitle = mainTab === 'mermas' ? 'Registrar merma' : 'Registrar desmedro';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Perdidas</h1>
          <p className="text-sm text-stone-500 mt-0.5">{t.merma}s y {t.desmedro.toLowerCase()}s de tu operacion</p>
        </div>
        <button onClick={openForm} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* Main tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-fit">
          <button
            onClick={() => { setMainTab('mermas'); setSubTab('insumos'); }}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              mainTab === 'mermas' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <TrendingDown size={14} className="inline mr-1.5" />{t.merma}s
          </button>
          <button
            onClick={() => { setMainTab('desmedros'); setSubTab('productos'); }}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              mainTab === 'desmedros' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <AlertTriangle size={14} className="inline mr-1.5" />{t.desmedro}s
          </button>
        </div>

        {/* Period selector for desmedros */}
        {mainTab === 'desmedros' && periodos.length > 0 && (
          <div className="w-56">
            <CustomSelect
              options={periodos}
              value={periodoId}
              onChange={setPeriodoId}
              placeholder="Seleccionar periodo..."
            />
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div className="flex gap-4 border-b border-stone-200 mt-4 mb-4">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-1 pb-3 text-sm font-medium border-b-2 transition-all ${
              subTab === t.key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {mainTab === 'desmedros' && resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Productos', value: resumen.productos || 0, icon: Package },
            { label: 'Preparaciones', value: resumen.preparaciones || 0, icon: ChefHat },
            { label: 'Insumos', value: resumen.insumos || 0, icon: Salad },
            { label: 'Materiales', value: resumen.materiales || 0, icon: BoxSelect },
          ].map(card => (
            <div key={card.label} className={cx.card + ' p-4'}>
              <div className="flex items-center gap-2 mb-1">
                <card.icon size={14} className="text-stone-400" />
                <span className="text-xs text-stone-500 font-medium">{card.label}</span>
              </div>
              <p className="text-lg font-bold text-rose-600">{formatCurrency(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      {mainTab === 'mermas' && mermaStats.count > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
          <div className={cx.card + ' p-4'}>
            <span className="text-xs text-stone-500 font-medium">Registros</span>
            <p className="text-lg font-bold text-stone-800">{mermaStats.count}</p>
          </div>
          <div className={cx.card + ' p-4'}>
            <span className="text-xs text-stone-500 font-medium">Merma promedio</span>
            <p className="text-lg font-bold text-amber-600">{mermaStats.avgPct.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className={cx.card + ' overflow-hidden'}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200">
                {columns.map((col, i) => (
                  <th key={i} className={cx.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-sm text-stone-400">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center">
                    <Inbox size={32} className="mx-auto text-stone-300 mb-2" />
                    <p className="text-sm text-stone-400">No hay registros</p>
                  </td>
                </tr>
              ) : (
                items.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-900">{formTitle}</h2>
              <button onClick={() => setShowForm(false)} className={cx.btnGhost}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {renderFormFields()}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className={cx.btnSecondary}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={cx.btnPrimary}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
