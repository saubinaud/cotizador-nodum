import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatPercent, formatDate } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  History,
  Search,
  Package,
} from 'lucide-react';

export default function DashboardPage() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.get('/productos');
      setProducts(data.productos || data || []);
    } catch (err) {
      toast.error('Error cargando productos');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (product) => {
    try {
      await api.post(`/productos/${product.id}/duplicar`);
      toast.success('Producto duplicado');
      loadProducts();
    } catch {
      toast.error('Error duplicando producto');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/productos/${deleteTarget.id}`);
      toast.success('Producto eliminado');
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch {
      toast.error('Error eliminando producto');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleHistory = async (product) => {
    setHistoryModal(product);
    try {
      const data = await api.get(`/productos/${product.id}/historial`);
      setHistory(data.historial || data || []);
    } catch {
      setHistory([]);
    }
  };

  const filtered = products.filter((p) =>
    (p.nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={cx.skeleton + ' h-20'} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Mis Productos</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{products.length} productos</p>
        </div>
        <button
          onClick={() => navigate('/cotizador')}
          className={cx.btnPrimary + ' flex items-center gap-2'}
        >
          <Plus size={16} />
          Nuevo Producto
        </button>
      </div>

      {products.length > 0 && (
        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className={cx.input + ' pl-9'}
          />
        </div>
      )}

      {filtered.length === 0 && !loading ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Package size={40} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-400 text-sm">
            {products.length === 0
              ? 'Aun no tienes productos. Crea tu primer cotizacion.'
              : 'No se encontraron productos.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((p) => (
              <div key={p.id} className={`${cx.card} p-4`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-white font-medium text-sm">{p.nombre}</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">{formatDate(p.updated_at)}</p>
                  </div>
                  <span className="text-[#FA7B21] font-bold text-lg">
                    {formatCurrency(p.precio_final)}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-zinc-400 mb-3">
                  <span>Costo: {formatCurrency(p.costo_neto)}</span>
                  <span>Margen: {formatPercent(p.margen)}</span>
                </div>
                <div className="flex gap-2 border-t border-zinc-800 pt-3">
                  <button onClick={() => navigate(`/cotizador/${p.id}`)} className={cx.btnGhost + ' flex-1 flex items-center justify-center gap-1'}>
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => handleDuplicate(p)} className={cx.btnGhost + ' flex-1 flex items-center justify-center gap-1'}>
                    <Copy size={13} /> Duplicar
                  </button>
                  <button onClick={() => handleHistory(p)} className={cx.btnGhost + ' flex items-center justify-center gap-1'}>
                    <History size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className={cx.btnDanger + ' flex items-center justify-center gap-1'}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th}>Costo Neto</th>
                  <th className={cx.th}>Margen</th>
                  <th className={cx.th}>Precio Final</th>
                  <th className={cx.th}>Actualizado</th>
                  <th className={cx.th + ' text-right'}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={cx.td + ' text-white font-medium'}>{p.nombre}</td>
                    <td className={cx.td + ' text-zinc-300'}>{formatCurrency(p.costo_neto)}</td>
                    <td className={cx.td + ' text-zinc-300'}>{formatPercent(p.margen)}</td>
                    <td className={cx.td + ' text-[#FA7B21] font-semibold'}>{formatCurrency(p.precio_final)}</td>
                    <td className={cx.td + ' text-zinc-500'}>{formatDate(p.updated_at)}</td>
                    <td className={cx.td + ' text-right'}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => navigate(`/cotizador/${p.id}`)} className={cx.btnIcon} title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDuplicate(p)} className={cx.btnIcon} title="Duplicar">
                          <Copy size={15} />
                        </button>
                        <button onClick={() => handleHistory(p)} className={cx.btnIcon} title="Historial">
                          <History size={15} />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} className={cx.btnIcon + ' hover:text-red-400'} title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"? Esta accion no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* History modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setHistoryModal(null)} />
          <div className={`${cx.card} relative p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto`}>
            <h3 className="text-white font-semibold mb-4">Historial: {historyModal.nombre}</h3>
            {history.length === 0 ? (
              <p className="text-zinc-500 text-sm">Sin historial disponible.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="border-l-2 border-zinc-700 pl-3 py-1">
                    <p className="text-sm text-white">{formatCurrency(h.precio_final)}</p>
                    <p className="text-xs text-zinc-500">{formatDate(h.created_at)} - Margen: {formatPercent(h.margen)}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setHistoryModal(null)} className={cx.btnSecondary + ' mt-4 w-full'}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
