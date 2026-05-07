import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import { formatDate } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import {
  Package,
  AlertTriangle,
  XCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react';

function StatusBadge({ stock, minimo }) {
  if (stock === 0) {
    return <span className={cx.badge('bg-rose-50 text-rose-600')}>Agotado</span>;
  }
  if (stock <= minimo) {
    return <span className={cx.badge('bg-amber-50 text-amber-600')}>Bajo</span>;
  }
  return <span className={cx.badge('bg-emerald-50 text-emerald-600')}>OK</span>;
}

function MovimientoBadge({ tipo }) {
  const colors = {
    entrada: 'bg-emerald-50 text-emerald-600',
    salida: 'bg-rose-50 text-rose-600',
    ajuste: 'bg-blue-50 text-blue-600',
    venta: 'bg-amber-50 text-amber-600',
  };
  return (
    <span className={cx.badge(colors[tipo] || 'bg-stone-100 text-stone-600')}>
      {tipo}
    </span>
  );
}

export default function StockPage() {
  const api = useApi();
  const toast = useToast();

  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState({});
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [movimientos, setMovimientos] = useState({});
  const [loadingMov, setLoadingMov] = useState({});

  // Modal states
  const [showEntrada, setShowEntrada] = useState(false);
  const [entradaProductoId, setEntradaProductoId] = useState(null);
  const [entradaCantidad, setEntradaCantidad] = useState('');
  const [entradaNota, setEntradaNota] = useState('');
  const [savingEntrada, setSavingEntrada] = useState(false);

  const [ajusteProducto, setAjusteProducto] = useState(null);
  const [ajusteCantidad, setAjusteCantidad] = useState('');
  const [ajusteNota, setAjusteNota] = useState('');
  const [savingAjuste, setSavingAjuste] = useState(false);

  const loadStock = () => {
    setLoading(true);
    api.get('/stock')
      .then((r) => {
        setProductos(r.data?.productos || r.data || []);
        setResumen(r.data?.resumen || {});
      })
      .catch(() => toast.error('Error cargando inventario'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStock();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...productos];
    arr.sort((a, b) => {
      const sa = Number(a.stock_actual) || 0;
      const sb = Number(b.stock_actual) || 0;
      return sortAsc ? sa - sb : sb - sa;
    });
    return arr;
  }, [productos, sortAsc]);

  const summaryCards = useMemo(() => {
    const total = productos.length;
    const agotados = productos.filter((p) => (Number(p.stock_actual) || 0) === 0).length;
    const alerta = productos.filter((p) => {
      const s = Number(p.stock_actual) || 0;
      const m = Number(p.stock_minimo) || 0;
      return s > 0 && s <= m;
    }).length;
    return { total, alerta, agotados };
  }, [productos]);

  const toggleExpand = async (productoId) => {
    if (expandedId === productoId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(productoId);
    if (!movimientos[productoId]) {
      setLoadingMov((p) => ({ ...p, [productoId]: true }));
      try {
        const r = await api.get(`/stock/movimientos?producto_id=${productoId}`);
        setMovimientos((p) => ({ ...p, [productoId]: r.data || [] }));
      } catch {
        toast.error('Error cargando movimientos');
      } finally {
        setLoadingMov((p) => ({ ...p, [productoId]: false }));
      }
    }
  };

  const handleEntrada = async () => {
    if (!entradaProductoId || !entradaCantidad) return;
    setSavingEntrada(true);
    try {
      await api.post('/stock/entrada', {
        producto_id: entradaProductoId,
        cantidad: Number(entradaCantidad),
        nota: entradaNota.trim() || null,
      });
      toast.success('Entrada registrada');
      setShowEntrada(false);
      setEntradaProductoId(null);
      setEntradaCantidad('');
      setEntradaNota('');
      setMovimientos({});
      loadStock();
    } catch (err) {
      toast.error(err.message || 'Error registrando entrada');
    } finally {
      setSavingEntrada(false);
    }
  };

  const handleAjuste = async () => {
    if (!ajusteProducto || ajusteCantidad === '') return;
    setSavingAjuste(true);
    try {
      await api.post('/stock/ajuste', {
        producto_id: ajusteProducto.id,
        cantidad: Number(ajusteCantidad),
        nota: ajusteNota.trim() || null,
      });
      toast.success('Ajuste registrado');
      setAjusteProducto(null);
      setAjusteCantidad('');
      setAjusteNota('');
      setMovimientos({});
      loadStock();
    } catch (err) {
      toast.error(err.message || 'Error registrando ajuste');
    } finally {
      setSavingAjuste(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-3 gap-4">
          <div className={cx.skeleton + ' h-20'} />
          <div className={cx.skeleton + ' h-20'} />
          <div className={cx.skeleton + ' h-20'} />
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-stone-900">Inventario</h1>
        <button
          onClick={() => setShowEntrada(true)}
          className={cx.btnPrimary + ' flex items-center gap-1.5'}
        >
          <Plus size={14} /> Entrada
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className={`${cx.card} p-4 flex items-center gap-3`}>
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Package size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-stone-900">{summaryCards.total}</p>
            <p className="text-xs text-stone-500">Total productos</p>
          </div>
        </div>
        <div className={`${cx.card} p-4 flex items-center gap-3`}>
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-stone-900">{summaryCards.alerta}</p>
            <p className="text-xs text-stone-500">Stock bajo</p>
          </div>
        </div>
        <div className={`${cx.card} p-4 flex items-center gap-3`}>
          <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
            <XCircle size={18} className="text-rose-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-stone-900">{summaryCards.agotados}</p>
            <p className="text-xs text-stone-500">Sin stock</p>
          </div>
        </div>
      </div>

      {/* Stock table */}
      {productos.length === 0 ? (
        <div className={`${cx.card} p-10 text-center`}>
          <Package size={32} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">No hay productos con control de stock activo.</p>
          <p className="text-stone-400 text-xs mt-1">Activa el control de stock al crear o editar un producto.</p>
        </div>
      ) : (
        <div className={cx.card + ' overflow-hidden'}>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th}>SKU</th>
                  <th className={cx.th}>
                    <button
                      onClick={() => setSortAsc(!sortAsc)}
                      className="flex items-center gap-1 hover:text-stone-600 transition-colors"
                    >
                      Stock <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className={cx.th}>Minimo</th>
                  <th className={cx.th}>Estado</th>
                  <th className={cx.th + ' w-10'}></th>
                </tr>
              </thead>
              {sorted.map((prod) => {
                  const stock = Number(prod.stock_actual) || 0;
                  const minimo = Number(prod.stock_minimo) || 0;
                  const isExpanded = expandedId === prod.id;
                  return (
                    <tbody key={prod.id}>
                      <tr
                        className={cx.tr + ' cursor-pointer'}
                        onClick={() => toggleExpand(prod.id)}
                      >
                        <td className={cx.td + ' font-medium text-stone-800'}>{prod.nombre}</td>
                        <td className={cx.td + ' text-stone-500 text-xs font-mono'}>{prod.sku || '--'}</td>
                        <td className={cx.td + ' font-semibold text-stone-800'}>{stock}</td>
                        <td className={cx.td + ' text-stone-500'}>{minimo}</td>
                        <td className={cx.td}>
                          <StatusBadge stock={stock} minimo={minimo} />
                        </td>
                        <td className={cx.td}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAjusteProducto(prod);
                                setAjusteCantidad(String(stock));
                                setAjusteNota('');
                              }}
                              className={cx.btnGhost + ' text-xs py-1 px-2'}
                              title="Ajustar stock"
                            >
                              <SlidersHorizontal size={13} />
                            </button>
                            {isExpanded ? (
                              <ChevronUp size={14} className="text-stone-400" />
                            ) : (
                              <ChevronDown size={14} className="text-stone-400" />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-stone-50 px-6 py-4">
                            {loadingMov[prod.id] ? (
                              <div className={cx.skeleton + ' h-16 w-full'} />
                            ) : (movimientos[prod.id] || []).length === 0 ? (
                              <p className="text-stone-400 text-sm text-center py-2">Sin movimientos registrados.</p>
                            ) : (
                              <table className="w-full">
                                <thead>
                                  <tr>
                                    <th className={cx.th}>Fecha</th>
                                    <th className={cx.th}>Tipo</th>
                                    <th className={cx.th}>Cantidad</th>
                                    <th className={cx.th}>Stock result.</th>
                                    <th className={cx.th}>Nota</th>
                                    <th className={cx.th}>Usuario</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(movimientos[prod.id] || []).map((mov, i) => (
                                    <tr key={mov.id || i} className="border-b border-stone-100 last:border-0">
                                      <td className={cx.td + ' text-stone-500 text-xs'}>{formatDate(mov.fecha || mov.created_at)}</td>
                                      <td className={cx.td}><MovimientoBadge tipo={mov.tipo} /></td>
                                      <td className={cx.td + ' font-medium'}>
                                        <span className={mov.cantidad >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                          {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                                        </span>
                                      </td>
                                      <td className={cx.td + ' text-stone-600'}>{mov.stock_resultante ?? '--'}</td>
                                      <td className={cx.td + ' text-stone-500 text-xs'}>{mov.nota || '--'}</td>
                                      <td className={cx.td + ' text-stone-400 text-xs'}>{mov.usuario_nombre || mov.usuario || '--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-stone-100">
            {sorted.map((prod) => {
              const stock = Number(prod.stock_actual) || 0;
              const minimo = Number(prod.stock_minimo) || 0;
              const isExpanded = expandedId === prod.id;
              return (
                <div key={prod.id}>
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50/50 transition-colors"
                    onClick={() => toggleExpand(prod.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{prod.nombre}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {prod.sku && <span className="text-[10px] text-stone-400 font-mono">{prod.sku}</span>}
                        <StatusBadge stock={stock} minimo={minimo} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-stone-800">{stock}</p>
                        <p className="text-[10px] text-stone-400">min: {minimo}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAjusteProducto(prod);
                          setAjusteCantidad(String(stock));
                          setAjusteNota('');
                        }}
                        className={cx.btnGhost + ' text-xs py-1 px-2'}
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                      {isExpanded ? (
                        <ChevronUp size={14} className="text-stone-400" />
                      ) : (
                        <ChevronDown size={14} className="text-stone-400" />
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-stone-50 px-4 py-3 space-y-2">
                      {loadingMov[prod.id] ? (
                        <div className={cx.skeleton + ' h-12 w-full'} />
                      ) : (movimientos[prod.id] || []).length === 0 ? (
                        <p className="text-stone-400 text-sm text-center py-2">Sin movimientos.</p>
                      ) : (
                        (movimientos[prod.id] || []).map((mov, i) => (
                          <div key={mov.id || i} className="flex items-center justify-between bg-white rounded-lg p-2.5 text-xs">
                            <div className="flex items-center gap-2">
                              <MovimientoBadge tipo={mov.tipo} />
                              <span className={mov.cantidad >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                                {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                              </span>
                            </div>
                            <div className="text-right text-stone-400">
                              <p>{formatDate(mov.fecha || mov.created_at)}</p>
                              {mov.nota && <p className="truncate max-w-[120px]">{mov.nota}</p>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entrada modal */}
      {showEntrada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEntrada(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-stone-900 mb-4">Nueva entrada de stock</h3>
            <div className="space-y-4">
              <div>
                <label className={cx.label}>Producto</label>
                <SearchableSelect
                  options={productos}
                  value={entradaProductoId}
                  onChange={(item) => setEntradaProductoId(item.id)}
                  placeholder="Seleccionar producto..."
                />
              </div>
              <div>
                <label className={cx.label}>Cantidad</label>
                <input
                  type="number"
                  min="1"
                  value={entradaCantidad}
                  onChange={(e) => setEntradaCantidad(e.target.value)}
                  className={cx.input}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={cx.label}>Nota (opcional)</label>
                <input
                  type="text"
                  value={entradaNota}
                  onChange={(e) => setEntradaNota(e.target.value)}
                  className={cx.input}
                  placeholder="Ej: Compra proveedor"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setShowEntrada(false)} className={cx.btnGhost}>
                Cancelar
              </button>
              <button
                onClick={handleEntrada}
                disabled={!entradaProductoId || !entradaCantidad || savingEntrada}
                className={cx.btnPrimary + ' flex items-center gap-1.5'}
              >
                {savingEntrada ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Plus size={14} /> Registrar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ajuste modal */}
      {ajusteProducto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAjusteProducto(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-stone-900 mb-1">Ajuste de stock</h3>
            <p className="text-sm text-stone-500 mb-4">{ajusteProducto.nombre}</p>
            <div className="space-y-4">
              <div>
                <label className={cx.label}>Nueva cantidad</label>
                <input
                  type="number"
                  min="0"
                  value={ajusteCantidad}
                  onChange={(e) => setAjusteCantidad(e.target.value)}
                  className={cx.input}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={cx.label}>Motivo</label>
                <input
                  type="text"
                  value={ajusteNota}
                  onChange={(e) => setAjusteNota(e.target.value)}
                  className={cx.input}
                  placeholder="Ej: Conteo fisico, merma, etc."
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setAjusteProducto(null)} className={cx.btnGhost}>
                Cancelar
              </button>
              <button
                onClick={handleAjuste}
                disabled={ajusteCantidad === '' || savingAjuste}
                className={cx.btnPrimary + ' flex items-center gap-1.5'}
              >
                {savingAjuste ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Guardar ajuste'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
