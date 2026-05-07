import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  ShoppingBag,
  Link,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Upload,
  Download,
  X,
} from 'lucide-react';

export default function ShopifyPage() {
  const api = useApi();
  const toast = useToast();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [logs, setLogs] = useState([]);
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, []);

  const loadStatus = () =>
    api
      .get('/shopify/status')
      .then((r) => setStatus(r))
      .finally(() => setLoading(false));

  const loadLogs = () =>
    api
      .get('/shopify/logs')
      .then((r) => setLogs(r || []))
      .catch(() => {});

  const handleConnect = async () => {
    if (!storeUrl || !accessToken) {
      toast.error('URL y token requeridos');
      return;
    }
    setConnecting(true);
    try {
      const res = await api.post('/shopify/connect', {
        store_url: storeUrl,
        access_token: accessToken,
      });
      toast.success(`Conectado a ${res.store_name}`);
      loadStatus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (action) => {
    setSyncing(action);
    setSyncResult(null);
    try {
      const res = await api.post(`/shopify/${action}`);
      setSyncResult({ action, ...res });
      toast.success('Sincronizacion completada');
      loadStatus();
      loadLogs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    try {
      await api.del('/shopify/disconnect');
      setStatus(null);
      toast.success('Desconectado');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`${cx.skeleton} h-8 w-40`} />
        <div className={`${cx.skeleton} h-64 w-full`} />
      </div>
    );
  }

  const connected = status?.connected;

  // ---------- NOT CONNECTED ----------
  if (!connected) {
    return (
      <div>
        <h1 className="text-xl font-bold text-stone-900 mb-6">Shopify</h1>

        <div className={`${cx.card} max-w-lg mx-auto p-8`}>
          <div className="flex items-center gap-3 mb-6">
            <ShoppingBag size={24} className="text-[#96BF48]" />
            <h2 className="text-lg font-bold text-stone-900">
              Conecta tu tienda Shopify
            </h2>
          </div>

          <div className="bg-stone-50 rounded-lg p-4 mb-6 text-sm text-stone-600 space-y-1.5">
            <p className="font-semibold text-stone-700">Pasos:</p>
            <p>
              1. Ve a Shopify Admin &rarr; Settings &rarr; Apps
            </p>
            <p>
              2. Click &ldquo;Develop apps&rdquo; &rarr; &ldquo;Create an app&rdquo;
            </p>
            <p>3. En scopes, activa:</p>
            <p className="pl-4 font-mono text-xs text-stone-500">
              read_products, write_products
              <br />
              read_orders, write_inventory_levels
              <br />
              read_locations
            </p>
            <p>4. Install &rarr; copia el Access Token</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className={cx.label}>Store URL</label>
              <input
                className={cx.input}
                placeholder="mitienda.myshopify.com"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
              />
            </div>
            <div>
              <label className={cx.label}>Access Token</label>
              <input
                className={cx.input}
                placeholder="shpat_..."
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>
            <button
              className={cx.btnPrimary}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- CONNECTED ----------
  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  };

  const renderSyncResult = () => {
    if (!syncResult) return null;
    const { action, ...data } = syncResult;

    let items = [];
    if (action === 'sync-products') {
      items = [
        { label: 'Vinculados', value: data.vinculados },
        { label: 'Sin match', value: data.sin_match },
        { label: 'Total Shopify', value: data.total_shopify },
      ];
    } else if (action === 'pull-orders') {
      items = [
        { label: 'Importadas', value: data.imported },
        { label: 'Omitidas', value: data.skipped },
        { label: 'Errores', value: data.errors },
      ];
    } else if (action === 'push-stock') {
      items = [
        { label: 'Actualizados', value: data.updated },
        { label: 'Errores', value: data.errors },
      ];
    }

    return (
      <div className={`${cx.card} p-4 mb-6`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-700">
            Resultado: {action}
          </h3>
          <button
            onClick={() => setSyncResult(null)}
            className={cx.btnIcon}
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex gap-6">
          {items.map((it) => (
            <div key={it.label} className="text-center">
              <p className="text-lg font-bold text-stone-900">
                {it.value ?? '-'}
              </p>
              <p className="text-xs text-stone-500">{it.label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const typeBadge = (tipo) => {
    const colors = {
      pull_orders: 'bg-blue-50 text-blue-700',
      push_stock: 'bg-amber-50 text-amber-700',
      sync_products: 'bg-purple-50 text-purple-700',
    };
    return cx.badge(colors[tipo] || 'bg-stone-100 text-stone-600');
  };

  const statusBadge = (estado) => {
    if (estado === 'ok') return cx.badge('bg-emerald-50 text-emerald-700');
    return cx.badge('bg-rose-50 text-rose-700');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-900">Shopify</h1>
        <button
          className={cx.btnDanger}
          onClick={() => setConfirmDisconnect(true)}
        >
          Desconectar
        </button>
      </div>

      {/* Connection status */}
      <div className={`${cx.card} p-4 mb-6 flex items-center gap-3`}>
        <CheckCircle size={18} className="text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-800">
            Conectado a {status.store_url || status.store_name}
          </p>
          {status.last_sync && (
            <p className="text-xs text-stone-500">
              Ultima sync: {timeAgo(status.last_sync)}
            </p>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className={`${cx.card} p-4 text-center`}>
          <ShoppingBag size={18} className="mx-auto mb-1 text-stone-400" />
          <p className="text-xl font-bold text-stone-900">
            {status.total_shopify ?? '-'}
          </p>
          <p className="text-xs text-stone-500">Shopify</p>
        </div>
        <div className={`${cx.card} p-4 text-center`}>
          <Link size={18} className="mx-auto mb-1 text-stone-400" />
          <p className="text-xl font-bold text-stone-900">
            {status.vinculados ?? '-'}
          </p>
          <p className="text-xs text-stone-500">Vinculados</p>
        </div>
        <div className={`${cx.card} p-4 text-center`}>
          <AlertTriangle size={18} className="mx-auto mb-1 text-amber-500" />
          <p className="text-xl font-bold text-stone-900">
            {status.sin_sku ?? '-'}
          </p>
          <p className="text-xs text-stone-500">Sin SKU</p>
        </div>
      </div>

      {/* Sync actions */}
      <div className={`${cx.card} p-4 mb-6`}>
        <div className="flex flex-wrap gap-3">
          <button
            className={cx.btnPrimary}
            disabled={syncing}
            onClick={() => handleSync('sync-products')}
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw
                size={14}
                className={syncing === 'sync-products' ? 'animate-spin' : ''}
              />
              Sync Productos
            </span>
          </button>
          <button
            className={cx.btnSecondary}
            disabled={syncing}
            onClick={() => handleSync('pull-orders')}
          >
            <span className="inline-flex items-center gap-1.5">
              <Download
                size={14}
                className={syncing === 'pull-orders' ? 'animate-spin' : ''}
              />
              Pull Ordenes
            </span>
          </button>
          <button
            className={cx.btnSecondary}
            disabled={syncing}
            onClick={() => handleSync('push-stock')}
          >
            <span className="inline-flex items-center gap-1.5">
              <Upload
                size={14}
                className={syncing === 'push-stock' ? 'animate-spin' : ''}
              />
              Push Stock
            </span>
          </button>
        </div>
      </div>

      {/* Sync result */}
      {renderSyncResult()}

      {/* Logs */}
      {logs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            Ultimas sincronizaciones
          </h2>
          <div className={`${cx.card} overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Fecha</th>
                  <th className={cx.th}>Tipo</th>
                  <th className={cx.th}>Estado</th>
                  <th className={cx.th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className={cx.tr}>
                    <td className={cx.td}>
                      <span className="text-stone-500 text-xs">
                        {log.fecha
                          ? new Date(log.fecha).toLocaleTimeString('es', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </span>
                    </td>
                    <td className={cx.td}>
                      <span className={typeBadge(log.tipo)}>{log.tipo}</span>
                    </td>
                    <td className={cx.td}>
                      <span className={statusBadge(log.estado)}>
                        {log.estado}
                      </span>
                    </td>
                    <td className={cx.td}>
                      <span className="text-xs text-stone-600">
                        {typeof log.detalle === 'object'
                          ? JSON.stringify(log.detalle)
                          : log.detalle || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Desconectar Shopify"
        message="Se eliminara la conexion con tu tienda Shopify. Podras reconectarla mas adelante."
        confirmText="Desconectar"
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}
