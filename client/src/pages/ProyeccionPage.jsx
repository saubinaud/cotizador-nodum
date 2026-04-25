import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import { TrendingUp, Calculator, Target } from 'lucide-react';

export default function ProyeccionPage() {
  const api = useApi();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metaGanancia, setMetaGanancia] = useState('');
  const [cantidades, setCantidades] = useState({});
  const [pesos, setPesos] = useState({}); // % peso por producto

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.get('/productos');
      setProducts(data.data || []);
    } catch {
      toast.error('Error cargando productos');
    } finally {
      setLoading(false);
    }
  };

  const gananciaUni = (p) => Number(p.precio_final) - Number(p.costo_neto);

  const updatePeso = (id, value) => {
    setPesos((prev) => ({ ...prev, [id]: Math.max(0, Math.min(100, Number(value) || 0)) }));
  };

  const distribuirIgual = () => {
    const activos = products.filter((p) => gananciaUni(p) > 0);
    if (activos.length === 0) return;
    const pesoIgual = Math.round(100 / activos.length);
    const nuevos = {};
    activos.forEach((p, i) => {
      nuevos[p.id] = i === activos.length - 1 ? 100 - pesoIgual * (activos.length - 1) : pesoIgual;
    });
    setPesos(nuevos);
  };

  const calcularDesdeMetaGanancia = () => {
    const meta = Number(metaGanancia);
    if (!meta || products.length === 0) return;
    const productosConMargen = products.filter((p) => gananciaUni(p) > 0);
    if (productosConMargen.length === 0) {
      toast.error('No hay productos con margen positivo');
      return;
    }
    // Si no hay pesos configurados, distribuir igual
    const totalPeso = productosConMargen.reduce((s, p) => s + (pesos[p.id] || 0), 0);
    const usarPesos = totalPeso > 0;

    const nuevas = {};
    productosConMargen.forEach((p) => {
      const peso = usarPesos ? (pesos[p.id] || 0) / totalPeso : 1 / productosConMargen.length;
      const metaProducto = meta * peso;
      const gUni = gananciaUni(p);
      nuevas[p.id] = gUni > 0 ? Math.ceil(metaProducto / gUni) : 0;
    });
    setCantidades(nuevas);
  };

  const updateCantidad = (id, value) => {
    setCantidades((prev) => ({ ...prev, [id]: Math.max(0, Number(value) || 0) }));
  };

  // Totals
  const totalUnidades = products.reduce((s, p) => s + (cantidades[p.id] || 0), 0);
  const totalIngresos = products.reduce((s, p) => s + Number(p.precio_final) * (cantidades[p.id] || 0), 0);
  const totalCostos = products.reduce((s, p) => s + Number(p.costo_neto) * (cantidades[p.id] || 0), 0);
  const totalGanancia = totalIngresos - totalCostos;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className={cx.skeleton + ' h-10 w-64'} />
        <div className={cx.skeleton + ' h-32'} />
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)] flex items-center justify-center">
          <TrendingUp size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-stone-800">Proyección de Ventas</h2>
          <p className="text-stone-400 text-xs">Calcula cuánto necesitas vender para alcanzar tu meta</p>
        </div>
      </div>

      {/* Target input */}
      <div className={`${cx.card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-[var(--accent)]" />
          <span className="text-stone-800 text-sm font-medium">Meta de ganancia</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className={cx.label}>Ganancia objetivo (S/)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={metaGanancia}
              onChange={(e) => setMetaGanancia(e.target.value)}
              placeholder="Ej: 5000"
              className={cx.input}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={distribuirIgual}
              disabled={products.length === 0}
              className={cx.btnSecondary + ' whitespace-nowrap text-xs'}
            >
              Peso igual
            </button>
            <button
              onClick={calcularDesdeMetaGanancia}
              disabled={!metaGanancia || products.length === 0}
              className={cx.btnPrimary + ' flex items-center gap-2 whitespace-nowrap'}
            >
              <Calculator size={15} />
              Calcular
            </button>
          </div>
        </div>
        {metaGanancia && totalGanancia > 0 && (
          <div className="mt-3 text-xs text-stone-400">
            {totalGanancia >= Number(metaGanancia) ? (
              <span className="text-[var(--success)]">Meta alcanzada con las cantidades actuales</span>
            ) : (
              <span className="text-amber-600">
                Falta {formatCurrency(Number(metaGanancia) - totalGanancia)} para alcanzar la meta
              </span>
            )}
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className={`${cx.card} p-8 text-center`}>
          <p className="text-stone-400 text-sm">No hay productos registrados</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {products.map((p) => {
              const cant = cantidades[p.id] || 0;
              const gUni = gananciaUni(p);
              const ingreso = Number(p.precio_final) * cant;
              const ganancia = gUni * cant;
              return (
                <div key={p.id} className={`${cx.card} p-4 space-y-3`}>
                  <div className="flex justify-between items-start">
                    <h3 className="text-stone-800 font-medium text-sm">{p.nombre}</h3>
                    <span className={`text-xs font-semibold ${gUni > 0 ? 'text-[var(--success)]' : 'text-rose-600'}`}>
                      {formatCurrency(gUni)}/uni
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                    <div>Costo neto: <span className="text-stone-800">{formatCurrency(p.costo_neto)}</span></div>
                    <div>Precio final: <span className="text-stone-800">{formatCurrency(p.precio_final)}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={cx.label}>Peso %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={pesos[p.id] || ''}
                        onChange={(e) => updatePeso(p.id, e.target.value)}
                        placeholder="—"
                        className={cx.input}
                      />
                    </div>
                    <div>
                      <label className={cx.label}>Cantidad</label>
                      <input
                        type="number"
                        min="0"
                        value={cant || ''}
                        onChange={(e) => updateCantidad(p.id, e.target.value)}
                        placeholder="0"
                        className={cx.input}
                      />
                    </div>
                  </div>
                  {cant > 0 && (
                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-stone-200 pt-2">
                      <div className="text-stone-500">Ingreso: <span className="text-stone-800">{formatCurrency(ingreso)}</span></div>
                      <div className="text-stone-500">Ganancia: <span className={ganancia >= 0 ? 'text-[var(--success)]' : 'text-rose-600'}>{formatCurrency(ganancia)}</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th}>Costo Neto</th>
                  <th className={cx.th}>Precio Final</th>
                  <th className={cx.th}>Ganancia/uni</th>
                  <th className={cx.th + ' w-20'}>Peso %</th>
                  <th className={cx.th + ' w-24'}>Cantidad</th>
                  <th className={cx.th + ' text-right'}>Ingreso</th>
                  <th className={cx.th + ' text-right'}>Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const cant = cantidades[p.id] || 0;
                  const gUni = gananciaUni(p);
                  const ingreso = Number(p.precio_final) * cant;
                  const ganancia = gUni * cant;
                  return (
                    <tr key={p.id} className={cx.tr}>
                      <td className={cx.td + ' text-stone-800 font-medium'}>{p.nombre}</td>
                      <td className={cx.td + ' text-stone-500'}>{formatCurrency(p.costo_neto)}</td>
                      <td className={cx.td + ' text-stone-500'}>{formatCurrency(p.precio_final)}</td>
                      <td className={cx.td}>
                        <span className={gUni > 0 ? 'text-[var(--success)]' : 'text-rose-600'}>
                          {formatCurrency(gUni)}
                        </span>
                      </td>
                      <td className={cx.td}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={pesos[p.id] || ''}
                          onChange={(e) => updatePeso(p.id, e.target.value)}
                          placeholder="—"
                          className={cx.input + ' w-16 text-center'}
                        />
                      </td>
                      <td className={cx.td}>
                        <input
                          type="number"
                          min="0"
                          value={cant || ''}
                          onChange={(e) => updateCantidad(p.id, e.target.value)}
                          placeholder="0"
                          className={cx.input + ' w-24'}
                        />
                      </td>
                      <td className={cx.td + ' text-right text-stone-800'}>{formatCurrency(ingreso)}</td>
                      <td className={cx.td + ' text-right'}>
                        <span className={ganancia >= 0 ? 'text-[var(--success)]' : 'text-rose-600'}>
                          {formatCurrency(ganancia)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Totals */}
      {totalUnidades > 0 && (
        <div className={`${cx.card} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={16} className="text-[var(--accent)]" />
            <span className="text-stone-800 text-sm font-medium">Resumen de proyección</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-stone-400 text-[10px] uppercase tracking-widest font-semibold mb-1">Unidades</p>
              <p className="text-stone-800 text-lg font-bold">{totalUnidades}</p>
            </div>
            <div>
              <p className="text-stone-400 text-[10px] uppercase tracking-widest font-semibold mb-1">Ingresos</p>
              <p className="text-stone-800 text-lg font-bold">{formatCurrency(totalIngresos)}</p>
            </div>
            <div>
              <p className="text-stone-400 text-[10px] uppercase tracking-widest font-semibold mb-1">Costos</p>
              <p className="text-stone-500 text-lg font-bold">{formatCurrency(totalCostos)}</p>
            </div>
            <div>
              <p className="text-stone-400 text-[10px] uppercase tracking-widest font-semibold mb-1">Ganancia</p>
              <p className={`text-lg font-bold ${totalGanancia >= 0 ? 'text-[var(--success)]' : 'text-rose-600'}`}>
                {formatCurrency(totalGanancia)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
