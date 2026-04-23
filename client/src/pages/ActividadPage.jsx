import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import {
  Activity,
  Package,
  Salad,
  Box,
  RefreshCw,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';

const iconMap = {
  producto: Package,
  insumo: Salad,
  material: Box,
};
const colorMap = {
  crear: 'text-green-400 bg-green-500/10',
  actualizar: 'text-blue-400 bg-blue-500/10',
  eliminar: 'text-red-400 bg-red-500/10',
};
const accionIcon = { crear: Plus, actualizar: Pencil, eliminar: Trash2 };

export default function ActividadPage() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.get('/historial/actividad');
      setLogs(data.data || []);
    } catch {
      toast.error('Error cargando actividad');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (log) => {
    if (restoring === log.id) {
      // Second click = confirm
      try {
        await api.post(`/productos/${log.producto_id}/restaurar/${log.version}`);
        toast.success(`Restaurado a version ${log.version}`);
        setRestoring(null);
        loadLogs();
      } catch {
        toast.error('Error restaurando');
      }
    } else {
      setRestoring(log.id);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Mi Actividad</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Historial de cambios en tus datos</p>
        </div>
        <button onClick={loadLogs} className={cx.btnSecondary + ' flex items-center gap-2'}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : logs.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Activity size={40} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-400 text-sm">Sin actividad registrada. Crea insumos o productos para ver cambios aqui.</p>
        </div>
      ) : (
        <div className={`${cx.card} overflow-hidden divide-y divide-zinc-800`}>
          {logs.map((log) => {
            const Icon = iconMap[log.entidad] || Activity;
            const color = colorMap[log.accion] || 'text-zinc-400 bg-zinc-800';
            const AccionIcon = accionIcon[log.accion] || Activity;
            const isVersion = log.tipo === 'version';

            return (
              <div key={`${log.tipo}-${log.id}`} className="p-4 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {isVersion ? (
                          <p className="text-white text-sm">
                            <span className="capitalize">{log.accion}</span>{' '}
                            <button
                              onClick={() => navigate(`/cotizador/${log.producto_id}`)}
                              className="text-[#FA7B21] hover:underline"
                            >
                              {log.producto_nombre}
                            </button>
                            {log.version > 1 && <span className="text-zinc-500"> — v{log.version}</span>}
                          </p>
                        ) : (
                          <p className="text-white text-sm">
                            <span className="capitalize">{log.accion}</span> {log.entidad}{' '}
                            {log.cambios_json?.nombre && (
                              <span className="text-zinc-400">"{log.cambios_json.nombre}"</span>
                            )}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1">
                          {isVersion && log.motivo && (
                            <span className="text-zinc-500 text-xs">{log.motivo}</span>
                          )}
                          {isVersion && log.precio_final && (
                            <span className="text-zinc-400 text-xs">
                              Costo: {formatCurrency(log.costo_neto)} → Final: {formatCurrency(log.precio_final)}
                            </span>
                          )}
                          <span className="text-zinc-600 text-xs">
                            {log.created_at ? new Date(log.created_at).toLocaleString('es-PE') : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cx.badge(color)}>{log.accion}</span>
                        {isVersion && log.version > 1 && (
                          restoring === log.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRestore(log)}
                                className="text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setRestoring(null)}
                                className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRestore(log)}
                              className={cx.btnIcon + ' text-amber-400 hover:text-amber-300'}
                              title="Restaurar a esta version"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
