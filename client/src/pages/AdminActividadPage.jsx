import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatDate } from '../utils/format';
import { Activity, User, Package, Salad, LogIn, RefreshCw, Box } from 'lucide-react';

const iconMap = {
  login: LogIn,
  producto: Package,
  insumo: Salad,
  material: Box,
  default: Activity,
};

const colorMap = {
  crear: 'text-emerald-600 bg-green-500/10',
  actualizar: 'text-blue-400 bg-blue-500/10',
  eliminar: 'text-rose-600 bg-rose-50',
  login: 'text-amber-600 bg-amber-50',
  default: 'text-stone-500 bg-stone-100',
};

function getIcon(tipo) {
  return iconMap[tipo] || iconMap.default;
}

function getColor(accion) {
  return colorMap[accion] || colorMap.default;
}

export default function AdminActividadPage() {
  const api = useApi();
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadLogs(1);
  }, []);

  const loadLogs = async (p) => {
    try {
      setLoading(true);
      const data = await api.get(`/admin/actividad?page=${p}&limit=50`);
      const items = data.data || [];
      if (p === 1) {
        setLogs(items);
      } else {
        setLogs((prev) => [...prev, ...items]);
      }
      setHasMore(items.length >= 50);
      setPage(p);
    } catch {
      toast.error('Error cargando actividad');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => loadLogs(1);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-stone-800">Actividad</h2>
          <p className="text-stone-400 text-sm mt-0.5">Registro de actividad del sistema</p>
        </div>
        <button onClick={refresh} className={cx.btnSecondary + ' flex items-center gap-2'}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cx.skeleton + ' h-16'} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Activity size={40} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">Sin actividad registrada.</p>
        </div>
      ) : (
        <div className={`${cx.card} overflow-hidden`}>
          <div className="divide-y divide-stone-200">
            {logs.map((log, i) => {
              const Icon = getIcon(log.entidad);
              const color = getColor(log.accion);
              return (
                <div key={log.id || i} className="flex items-start gap-4 p-4 hover:bg-stone-100 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-800 text-sm">{`${log.accion} ${log.entidad} #${log.entidad_id}`}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {log.usuario_nombre && (
                        <span className="text-stone-400 text-xs flex items-center gap-1">
                          <User size={11} /> {log.usuario_nombre}
                        </span>
                      )}
                      <span className="text-stone-400 text-xs">
                        {log.created_at ? new Date(log.created_at).toLocaleString('es-PE') : '-'}
                      </span>
                    </div>
                  </div>
                  {log.accion && (
                    <span className={cx.badge(color) + ' flex-shrink-0'}>
                      {log.accion}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="p-4 border-t border-stone-200 text-center">
              <button
                onClick={() => loadLogs(page + 1)}
                disabled={loading}
                className={cx.btnGhost}
              >
                {loading ? 'Cargando...' : 'Cargar mas'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
