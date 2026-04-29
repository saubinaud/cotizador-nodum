import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import {
  Activity,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'Ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days}d`;
  return new Date(date).toLocaleDateString('es-PE');
}

const badgeColors = {
  crear: 'bg-emerald-50 text-emerald-700',
  editar: 'bg-sky-50 text-sky-700',
  eliminar: 'bg-rose-50 text-rose-700',
  emitir: 'bg-violet-50 text-violet-700',
  anular: 'bg-amber-50 text-amber-700',
  pagar: 'bg-emerald-50 text-emerald-700',
};

const ENTITIES = [
  { value: '', label: 'Todas' },
  { value: 'producto', label: 'Productos' },
  { value: 'venta', label: 'Ventas' },
  { value: 'gasto', label: 'Gastos' },
  { value: 'compra', label: 'Compras' },
  { value: 'comprobante', label: 'Comprobantes' },
  { value: 'insumo', label: 'Insumos' },
  { value: 'movimiento', label: 'Movimientos' },
  { value: 'arqueo', label: 'Arqueos' },
  { value: 'transferencia', label: 'Transferencias' },
];

const PAGE_SIZE = 50;

export default function ActividadPage() {
  const api = useApi();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadAudit = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: currentOffset });
      if (filterEntity) params.set('entidad', filterEntity);
      const data = await api.get(`/historial/audit?${params}`);
      const rows = data.data || [];
      if (reset) {
        setItems(rows);
      } else {
        setItems(prev => [...prev, ...rows]);
      }
      setHasMore(rows.length >= PAGE_SIZE);
    } catch {
      toast.error('Error cargando actividad');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, offset]);

  useEffect(() => {
    loadAudit(true);
  }, [filterEntity]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    // trigger load with new offset
    (async () => {
      try {
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset: newOffset });
        if (filterEntity) params.set('entidad', filterEntity);
        const data = await api.get(`/historial/audit?${params}`);
        const rows = data.data || [];
        setItems(prev => [...prev, ...rows]);
        setHasMore(rows.length >= PAGE_SIZE);
      } catch {
        toast.error('Error cargando mas actividad');
      }
    })();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Mi Actividad</h2>
          <p className="text-stone-500 text-sm mt-0.5">Historial de cambios en tus datos</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterEntity}
            onChange={e => setFilterEntity(e.target.value)}
            className="text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            {ENTITIES.map(e => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <button onClick={() => loadAudit(true)} className={cx.btnSecondary + ' flex items-center gap-2'}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : items.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Activity size={40} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">Sin actividad registrada. Crea insumos o productos para ver cambios aqui.</p>
        </div>
      ) : (
        <>
          <div className={`${cx.card} overflow-hidden`}>
            <div className="divide-y divide-stone-100">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#0A2F24] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {item.usuario_nombre?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-800">{item.descripcion || `${item.accion} ${item.entidad}`}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{timeAgo(item.created_at)}</p>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg shrink-0 ${badgeColors[item.accion] || 'bg-stone-100 text-stone-600'}`}>
                    {item.accion}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                className={cx.btnSecondary + ' flex items-center gap-2'}
              >
                <ChevronDown size={14} /> Cargar mas
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
