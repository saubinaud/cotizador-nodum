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
  Grid3X3,
  LayoutList,
  Download,
  MoreVertical,
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
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [viewMode, setViewMode] = useState('gallery');
  const [detailModal, setDetailModal] = useState(null);
  const [detailData, setDetailData] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.get('/productos');
      setProducts(data.data || []);
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

  const handleDetail = async (product) => {
    setDetailModal(product);
    try {
      const data = await api.get(`/productos/${product.id}`);
      setDetailData(data.data || data);
    } catch {
      setDetailData(null);
    }
  };

  const handleHistory = async (product) => {
    setHistoryModal(product);
    try {
      const data = await api.get(`/historial/productos/${product.id}/versiones`);
      setHistory(data.data || []);
    } catch {
      setHistory([]);
    }
  };

  const filtered = products.filter((p) =>
    (p.nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (products.length === 0) return;
    setExporting(true);
    try {
      // Load full details for each product
      const details = await Promise.all(
        products.map((p) => api.get(`/productos/${p.id}`).then((d) => d.data || d).catch(() => p))
      );

      const sep = ',';
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [];

      // ===== RESUMEN =====
      lines.push([esc('RESUMEN DE PRODUCTOS NODUM'), '', '', '', '', '', '', ''].join(sep));
      lines.push([esc(`Fecha: ${new Date().toLocaleDateString('es-PE')}`), '', '', '', '', '', '', ''].join(sep));
      lines.push([].join(sep));
      lines.push(['Producto', 'Costo Insumos', 'Costo Empaque', 'Costo Neto', 'Margen %', 'Precio Venta', 'IGV', 'Precio Final'].map(esc).join(sep));
      products.forEach((p) => {
        lines.push([
          p.nombre,
          Number(p.costo_insumos).toFixed(2),
          Number(p.costo_empaque).toFixed(2),
          Number(p.costo_neto).toFixed(2),
          (Number(p.margen) * 100).toFixed(1) + '%',
          Number(p.precio_venta).toFixed(2),
          (Number(p.precio_final) - Number(p.precio_venta)).toFixed(2),
          Number(p.precio_final).toFixed(2),
        ].map(esc).join(sep));
      });

      // ===== DETALLE POR PRODUCTO =====
      details.forEach((prod) => {
        lines.push([].join(sep));
        lines.push([].join(sep));
        lines.push([esc(`═══ ${(prod.nombre || '').toUpperCase()} ═══`), '', '', '', '', '', '', ''].join(sep));
        lines.push([].join(sep));

        // Preparaciones
        (prod.preparaciones || []).forEach((prep, pi) => {
          lines.push([esc(`Preparación ${pi + 1}: ${prep.nombre || 'Sin nombre'}${prep.capacidad ? ` (${parseFloat(prep.capacidad)} ${prep.unidad_capacidad || ''})` : ''}`), '', '', '', '', '', '', ''].join(sep));
          lines.push(['Insumo', 'Unidad', 'Cantidad', 'Costo Unitario', 'Subtotal', '', '', ''].map(esc).join(sep));

          let totalPrep = 0;
          (prep.insumos || []).forEach((ins) => {
            const cu = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
            const cant = parseFloat(ins.cantidad_usada || ins.cantidad) || 0;
            const sub = cu * cant;
            totalPrep += sub;
            lines.push([
              ins.nombre || '',
              ins.unidad_medida || '',
              cant,
              cu.toFixed(4),
              sub.toFixed(2),
              '', '', '',
            ].map(esc).join(sep));
          });
          lines.push([esc(''), esc(''), esc(''), esc('Subtotal preparación:'), esc(totalPrep.toFixed(2)), '', '', ''].join(sep));
          lines.push([].join(sep));
        });

        // Materiales
        if ((prod.materiales || []).length > 0) {
          lines.push([esc('Empaque / Materiales'), '', '', '', '', '', '', ''].join(sep));
          lines.push(['Material', 'Unidad', 'Cantidad', 'Precio Unitario', 'Subtotal', '', '', ''].map(esc).join(sep));
          let totalMat = 0;
          (prod.materiales || []).forEach((mat) => {
            const pu = Number(mat.cantidad_presentacion) > 0 ? Number(mat.precio_presentacion) / Number(mat.cantidad_presentacion) : 0;
            const cant = parseFloat(mat.cantidad) || 0;
            const sub = pu * cant;
            totalMat += sub;
            lines.push([
              mat.nombre || '',
              mat.unidad_medida || '',
              cant,
              pu.toFixed(4),
              sub.toFixed(2),
              '', '', '',
            ].map(esc).join(sep));
          });
          lines.push([esc(''), esc(''), esc(''), esc('Subtotal materiales:'), esc(totalMat.toFixed(2)), '', '', ''].join(sep));
          lines.push([].join(sep));
        }

        // Resumen del producto
        lines.push([esc('COSTOS'), '', '', '', '', '', '', ''].join(sep));
        lines.push([esc('Costo insumos:'), esc(Number(prod.costo_insumos).toFixed(2)), '', esc('Precio venta:'), esc(Number(prod.precio_venta).toFixed(2)), '', '', ''].join(sep));
        lines.push([esc('Costo empaque:'), esc(Number(prod.costo_empaque).toFixed(2)), '', esc('IGV:'), esc((Number(prod.precio_final) - Number(prod.precio_venta)).toFixed(2)), '', '', ''].join(sep));
        lines.push([esc('Costo neto:'), esc(Number(prod.costo_neto).toFixed(2)), '', esc('PRECIO FINAL:'), esc(Number(prod.precio_final).toFixed(2)), '', '', ''].join(sep));
        lines.push([esc('Margen:'), esc((Number(prod.margen) * 100).toFixed(1) + '%'), '', '', '', '', '', ''].join(sep));
      });

      const csv = lines.join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recetas_nodum_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel descargado');
    } catch {
      toast.error('Error generando Excel');
    } finally {
      setExporting(false);
    }
  };

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
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={exporting}
            className={cx.btnSecondary + ' flex items-center gap-2'}
            title="Exportar recetas completas"
          >
            {exporting ? <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" /> : <Download size={16} />}
          </button>
          <button
            onClick={() => navigate('/cotizador')}
            className={cx.btnPrimary + ' flex items-center gap-2'}
          >
            <Plus size={16} />
            Nuevo Producto
          </button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="mb-4 flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className={cx.input + ' pl-9'}
            />
          </div>
          <button
            onClick={() => setViewMode('gallery')}
            className={`${cx.btnIcon} ${viewMode === 'gallery' ? 'text-[#FA7B21]' : ''}`}
            title="Vista galeria"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`${cx.btnIcon} ${viewMode === 'table' ? 'text-[#FA7B21]' : ''}`}
            title="Vista lista"
          >
            <LayoutList size={18} />
          </button>
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
          {/* Gallery view */}
          {viewMode === 'gallery' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((p) => (
                <div key={p.id} className={`${cx.card} overflow-hidden cursor-pointer group relative`} onClick={() => handleDetail(p)}>
                  {p.imagen_url ? (
                    <div className="aspect-[4/3] bg-zinc-800 overflow-hidden">
                      <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-zinc-800 flex items-center justify-center">
                      <Package size={32} className="text-zinc-700" />
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="text-white text-sm font-medium truncate">{p.nombre}</h3>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-zinc-500 text-xs">Margen: {formatPercent(p.margen)}</span>
                      <span className="text-[#FA7B21] font-bold text-sm">{formatCurrency(p.precio_final)}</span>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleDuplicate(p)} className="bg-zinc-900/80 backdrop-blur rounded-lg p-1.5 text-zinc-400 hover:text-white" title="Duplicar">
                      <Copy size={13} />
                    </button>
                    <button onClick={() => handleHistory(p)} className="bg-zinc-900/80 backdrop-blur rounded-lg p-1.5 text-zinc-400 hover:text-white" title="Historial">
                      <History size={13} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="bg-zinc-900/80 backdrop-blur rounded-lg p-1.5 text-zinc-400 hover:text-red-400" title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
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
          <div className="absolute inset-0 bg-black/60" onClick={() => { setHistoryModal(null); setSelectedVersion(null); setConfirmRestore(null); }} />
          <div className={`${cx.card} relative p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto`}>
            <h3 className="text-white font-semibold mb-4">Historial: {historyModal.nombre}</h3>

            {history.length === 0 ? (
              <p className="text-zinc-500 text-sm">Sin historial disponible.</p>
            ) : confirmRestore ? (
              /* Confirmation step */
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-400 text-sm font-medium mb-1">Confirmar restauracion</p>
                  <p className="text-zinc-300 text-sm">
                    Vas a revertir <strong>{historyModal.nombre}</strong> a la <strong>version {confirmRestore.version}</strong> ({confirmRestore.motivo}).
                  </p>
                  <p className="text-zinc-500 text-xs mt-2">Se creara una nueva version con los valores restaurados. Los datos actuales no se pierden.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await api.post(`/productos/${historyModal.id}/restaurar/${confirmRestore.version}`);
                        toast.success(`Restaurado a version ${confirmRestore.version}`);
                        setHistoryModal(null);
                        setSelectedVersion(null);
                        setConfirmRestore(null);
                        loadProducts();
                      } catch {
                        toast.error('Error restaurando version');
                      }
                    }}
                    className={cx.btnPrimary + ' flex-1 bg-amber-600 hover:bg-amber-500'}
                  >
                    Si, restaurar
                  </button>
                  <button onClick={() => setConfirmRestore(null)} className={cx.btnSecondary + ' flex-1'}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : selectedVersion ? (
              /* Version detail view */
              <div className="space-y-4">
                <button onClick={() => setSelectedVersion(null)} className={cx.btnGhost + ' text-xs mb-2'}>
                  ← Volver al listado
                </button>
                <div className="flex items-center justify-between">
                  <h4 className="text-zinc-300 text-sm font-semibold">Version {selectedVersion.version} — {selectedVersion.motivo}</h4>
                  <span className="text-zinc-500 text-xs">{formatDate(selectedVersion.created_at)}</span>
                </div>

                {/* Snapshot details */}
                {(() => {
                  const snap = selectedVersion.snapshot_json || {};
                  const current = historyModal;
                  const fields = [
                    { key: 'nombre', label: 'Nombre' },
                    { key: 'costo_insumos', label: 'Costo insumos', fmt: formatCurrency },
                    { key: 'costo_empaque', label: 'Costo empaque', fmt: formatCurrency },
                    { key: 'costo_neto', label: 'Costo neto', fmt: formatCurrency },
                    { key: 'margen', label: 'Margen', fmt: (v) => (Number(v) < 1 ? (Number(v) * 100).toFixed(1) : Number(v).toFixed(1)) + '%' },
                    { key: 'precio_venta', label: 'Precio venta', fmt: formatCurrency },
                    { key: 'precio_final', label: 'Precio final', fmt: formatCurrency },
                  ];
                  return (
                    <div className="bg-zinc-800 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left px-3 py-2">Campo</th>
                            <th className="text-center px-3 py-2">Esta version</th>
                            <th className="text-center px-3 py-2">Actual</th>
                            <th className="text-center px-3 py-2">Cambio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((f) => {
                            const snapVal = snap[f.key];
                            const currVal = current[f.key];
                            const changed = String(snapVal) !== String(currVal);
                            const display = f.fmt || ((v) => v ?? '-');
                            return (
                              <tr key={f.key} className="border-t border-zinc-700/50">
                                <td className="px-3 py-2 text-zinc-400">{f.label}</td>
                                <td className="px-3 py-2 text-center text-white font-medium">{display(snapVal)}</td>
                                <td className="px-3 py-2 text-center text-zinc-400">{display(currVal)}</td>
                                <td className="px-3 py-2 text-center">
                                  {changed ? <span className="text-amber-400 text-xs">Diferente</span> : <span className="text-zinc-600 text-xs">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Restore button (not for latest version) */}
                {selectedVersion.version < history[0]?.version && (
                  <button
                    onClick={() => setConfirmRestore(selectedVersion)}
                    className={cx.btnPrimary + ' w-full bg-amber-600 hover:bg-amber-500 flex items-center justify-center gap-2'}
                  >
                    Restaurar a esta version
                  </button>
                )}
              </div>
            ) : (
              /* Version list */
              <div className="space-y-2">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedVersion(h)}
                    className="w-full text-left border-l-2 border-zinc-700 hover:border-[#FA7B21] pl-3 py-2 rounded-r-lg hover:bg-zinc-800 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-white">
                          {i === 0 && <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded mr-2">Actual</span>}
                          Version {h.version}
                        </p>
                        <p className="text-xs text-zinc-500">{h.motivo}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">{formatDate(h.created_at)}</p>
                        {h.precio_final && <p className="text-xs text-[#FA7B21]">{formatCurrency(h.precio_final)}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => { setHistoryModal(null); setSelectedVersion(null); setConfirmRestore(null); }} className={cx.btnSecondary + ' mt-4 w-full'}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setDetailModal(null); setDetailData(null); }} />
          <div className={`${cx.card} relative p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto`}>
            <div className="flex items-start gap-4 mb-5">
              {detailModal.imagen_url ? (
                <img src={detailModal.imagen_url} alt={detailModal.nombre} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <Package size={28} className="text-zinc-700" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-white font-bold text-lg">{detailModal.nombre}</h3>
                <div className="flex gap-4 mt-1 text-sm">
                  <span className="text-zinc-400">Margen: {formatPercent(detailModal.margen)}</span>
                  <span className="text-[#FA7B21] font-bold">{formatCurrency(detailModal.precio_final)}</span>
                </div>
              </div>
            </div>

            {!detailData ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className={cx.skeleton + ' h-10'} />)}</div>
            ) : (
              <>
                {/* Preparaciones */}
                {(detailData.preparaciones || []).map((prep, pi) => (
                  <div key={pi} className="mb-4">
                    <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                      {prep.nombre || `Preparacion ${pi + 1}`}
                      {prep.capacidad && <span className="text-zinc-500 font-normal"> — {parseFloat(prep.capacidad)} {prep.unidad_capacidad || ''}</span>}
                    </h4>
                    <div className="bg-zinc-800 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left px-3 py-2">Insumo</th>
                            <th className="text-center px-3 py-2">Cantidad</th>
                            <th className="text-center px-3 py-2">Costo Unit.</th>
                            <th className="text-right px-3 py-2">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(prep.insumos || []).map((ins, ii) => {
                            const cu = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
                            const cant = parseFloat(ins.cantidad_usada || ins.cantidad) || 0;
                            return (
                              <tr key={ii} className="border-t border-zinc-700/50">
                                <td className="px-3 py-2 text-white">{ins.nombre} <span className="text-zinc-500 text-xs">{ins.unidad_medida}</span></td>
                                <td className="px-3 py-2 text-center text-zinc-300">{cant}</td>
                                <td className="px-3 py-2 text-center text-zinc-400">{formatCurrency(cu)}</td>
                                <td className="px-3 py-2 text-right text-white">{formatCurrency(cu * cant)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Materiales */}
                {(detailData.materiales || []).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-zinc-300 mb-2">Empaque / Materiales</h4>
                    <div className="bg-zinc-800 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left px-3 py-2">Material</th>
                            <th className="text-center px-3 py-2">Cantidad</th>
                            <th className="text-center px-3 py-2">Precio Unit.</th>
                            <th className="text-right px-3 py-2">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailData.materiales || []).map((mat, mi) => {
                            const pu = Number(mat.cantidad_presentacion) > 0 ? Number(mat.precio_presentacion) / Number(mat.cantidad_presentacion) : 0;
                            const cant = parseFloat(mat.cantidad) || 0;
                            return (
                              <tr key={mi} className="border-t border-zinc-700/50">
                                <td className="px-3 py-2 text-white">{mat.nombre} <span className="text-zinc-500 text-xs">{mat.unidad_medida}</span></td>
                                <td className="px-3 py-2 text-center text-zinc-300">{cant}</td>
                                <td className="px-3 py-2 text-center text-zinc-400">{formatCurrency(pu)}</td>
                                <td className="px-3 py-2 text-right text-white">{formatCurrency(pu * cant)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="bg-zinc-800 rounded-xl p-4 space-y-2 mt-4">
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Costo insumos</span><span className="text-white">{formatCurrency(detailData.costo_insumos)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Costo empaque</span><span className="text-white">{formatCurrency(detailData.costo_empaque)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-zinc-700 pt-2"><span className="text-zinc-300">Costo neto</span><span className="text-white">{formatCurrency(detailData.costo_neto)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Margen</span><span className="text-white">{formatPercent(detailData.margen)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Precio venta</span><span className="text-white">{formatCurrency(detailData.precio_venta)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">IGV</span><span className="text-white">{formatCurrency(Number(detailData.precio_final) - Number(detailData.precio_venta))}</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-zinc-700 pt-2"><span className="text-zinc-300">Precio final</span><span className="text-[#FA7B21]">{formatCurrency(detailData.precio_final)}</span></div>
                </div>
              </>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={() => navigate(`/cotizador/${detailModal.id}`)} className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-2'}><Pencil size={14} /> Editar</button>
              <button onClick={() => { setDetailModal(null); setDetailData(null); }} className={cx.btnSecondary + ' flex-1'}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
