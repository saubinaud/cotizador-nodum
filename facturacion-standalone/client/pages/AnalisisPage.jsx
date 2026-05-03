import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Package, Plus, Trash2, AlertTriangle, CheckCircle, MinusCircle } from 'lucide-react';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import SearchableSelect from '../components/SearchableSelect';
import PeriodoSelector from '../components/PeriodoSelector';

const SEMAFORO_ORDER = { rojo: 0, amarillo: 1, verde: 2 };

function SemaforoDot({ semaforo }) {
  const colors = {
    verde: 'bg-emerald-500',
    amarillo: 'bg-amber-500',
    rojo: 'bg-rose-500',
  };
  return <span className={`inline-block w-3 h-3 rounded-full ${colors[semaforo] || 'bg-stone-300'}`} />;
}

export default function AnalisisPage() {
  const api = useApi();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [periodo, setPeriodo] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [sortKey, setSortKey] = useState('semaforo');
  const [sortAsc, setSortAsc] = useState(true);

  // Bundle state
  const [bundleItems, setBundleItems] = useState([]);
  const [bundleDescuento, setBundleDescuento] = useState(0);
  const [bundleResult, setBundleResult] = useState(null);
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    api.get(`/analisis/rentabilidad?year=${periodo.year}&month=${periodo.month}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Error cargando análisis'));
  }, [periodo]);

  useEffect(() => {
    api.get('/productos')
      .then(r => setProductos(r.data))
      .catch(() => {});
  }, []);

  const sortedProducts = useMemo(() => {
    if (!data?.productos) return [];
    const list = [...data.productos];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'semaforo') {
        cmp = (SEMAFORO_ORDER[a.semaforo] ?? 3) - (SEMAFORO_ORDER[b.semaforo] ?? 3);
      } else if (sortKey === 'nombre') {
        cmp = (a.nombre || '').localeCompare(b.nombre || '');
      } else {
        cmp = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const addBundleItem = (producto) => {
    if (!producto || bundleItems.find(b => b.id === producto.id)) return;
    setBundleItems([...bundleItems, { ...producto, cantidad: 1 }]);
    setBundleResult(null);
  };

  const removeBundleItem = (id) => {
    setBundleItems(bundleItems.filter(b => b.id !== id));
    setBundleResult(null);
  };

  const updateBundleCantidad = (id, cantidad) => {
    setBundleItems(bundleItems.map(b => b.id === id ? { ...b, cantidad: Math.max(1, Number(cantidad) || 1) } : b));
    setBundleResult(null);
  };

  const calcBundle = async () => {
    if (bundleItems.length === 0) return;
    try {
      const res = await api.post('/analisis/bundle', {
        items: bundleItems.map(b => ({ producto_id: b.id, cantidad: b.cantidad })),
        descuento_pct: bundleDescuento,
      });
      setBundleResult(res.data);
    } catch {
      toast.error('Error calculando bundle');
    }
  };

  const r = data?.resumen || {};
  const summaryCards = [
    { label: 'Verde', count: r.productos_verde ?? 0, color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
    { label: 'Amarillo', count: r.productos_amarillo ?? 0, color: 'bg-amber-50 text-amber-600', icon: MinusCircle },
    { label: 'Rojo', count: r.productos_rojo ?? 0, color: 'bg-rose-50 text-rose-600', icon: AlertTriangle },
    { label: r.nombre_rubro ? `Min. ${r.nombre_rubro}` : 'Margen mínimo', count: `${r.margen_minimo_usado || 33}%`, color: 'bg-stone-50 text-stone-600', icon: TrendingDown },
  ];

  const columns = [
    { key: 'nombre', label: 'Producto' },
    { key: 'costo', label: 'Costo' },
    { key: 'precio', label: 'Precio' },
    { key: 'margen', label: 'Margen' },
    { key: 'ganancia', label: 'Ganancia' },
    { key: 'unidades_vendidas', label: 'Uds vendidas' },
    { key: 'semaforo', label: 'Semáforo' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-stone-800">Rentabilidad</h1>
        <PeriodoSelector value={periodo} onChange={setPeriodo} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={`${cx.card} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cx.badge(card.color)}>
                <card.icon size={12} className="mr-1" />
                {card.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-stone-800">
              {card.isCurrency ? formatCurrency(card.count ?? 0) : card.count}
              {card.isCurrency && <span className="text-xs font-normal text-stone-400 ml-1">/mes</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Products Table */}
      <div className={`${cx.card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`${cx.th} cursor-pointer hover:text-stone-600 select-none`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p) => (
                <tr key={p.id} className={cx.tr}>
                  <td className={`${cx.td} font-medium text-stone-800`}>{p.nombre}</td>
                  <td className={cx.td}>{formatCurrency(p.costo)}</td>
                  <td className={cx.td}>{formatCurrency(p.precio)}</td>
                  <td className={`${cx.td} ${p.margen < 0 ? 'text-rose-600 font-semibold' : ''}`}>
                    {(p.margen * 100).toFixed(1)}%
                  </td>
                  <td className={cx.td}>{formatCurrency(p.ganancia)}</td>
                  <td className={cx.td}>{p.unidades_vendidas ?? 0}</td>
                  <td className={cx.td}><SemaforoDot semaforo={p.semaforo} /></td>
                </tr>
              ))}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${cx.td} text-center text-stone-400 py-8`}>
                    Sin datos para este periodo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bundle Simulator */}
      <div className={`${cx.card} p-6`}>
        <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <Package size={20} />
          Simulador de Bundle
        </h2>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: product selection */}
          <div className="space-y-4">
            <div>
              <label className={cx.label}>Agregar producto</label>
              <SearchableSelect
                options={productos.map(p => ({ value: p.id, label: p.nombre, ...p }))}
                onChange={(opt) => opt && addBundleItem({ id: opt.value || opt.id, nombre: opt.label || opt.nombre })}
                placeholder="Buscar producto..."
              />
            </div>

            {bundleItems.length > 0 && (
              <div className="space-y-2">
                {bundleItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-stone-700 truncate">{item.nombre}</span>
                    <input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) => updateBundleCantidad(item.id, e.target.value)}
                      className="w-16 px-2 py-1 border border-stone-300 rounded-md text-sm text-center"
                    />
                    <button onClick={() => removeBundleItem(item.id)} className={cx.btnDanger}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className={cx.label}>Descuento (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={bundleDescuento}
                onChange={(e) => { setBundleDescuento(Number(e.target.value) || 0); setBundleResult(null); }}
                className={`${cx.input} w-32`}
              />
            </div>

            <button
              onClick={calcBundle}
              disabled={bundleItems.length === 0}
              className={cx.btnPrimary}
            >
              Calcular Bundle
            </button>
          </div>

          {/* Right: results */}
          {bundleResult && (
            <div className={`${cx.card} p-4 space-y-3 border-stone-200`}>
              <h3 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">Resultado</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-stone-400">Costo total</p>
                  <p className="text-sm font-bold text-stone-800">{formatCurrency(bundleResult.costo_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">Precio bundle</p>
                  <p className="text-sm font-bold text-stone-800">{formatCurrency(bundleResult.precio_bundle)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">Margen</p>
                  <p className={`text-sm font-bold ${bundleResult.margen < 0 ? 'text-rose-600' : 'text-stone-800'}`}>
                    {(bundleResult.margen * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">Ganancia</p>
                  <p className="text-sm font-bold text-stone-800">{formatCurrency(bundleResult.ganancia)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">Descuento máximo</p>
                  <p className="text-sm font-bold text-stone-800">{(bundleResult.descuento_maximo * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">Precio mínimo</p>
                  <p className="text-sm font-bold text-stone-800">{formatCurrency(bundleResult.precio_minimo)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                <span className="text-xs text-stone-400">Semáforo:</span>
                <SemaforoDot semaforo={bundleResult.semaforo} />
                <span className="text-xs font-medium capitalize text-stone-600">{bundleResult.semaforo}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
