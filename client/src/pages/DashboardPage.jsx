import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatPercent, formatDate, precioComercial } from '../utils/format';
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
  Columns2,
  Square,
} from 'lucide-react';

function normU(u) { if (!u) return ''; if (u === 'l') return 'L'; return u; }
const FACTORES = { 'g→kg': 0.001, 'kg→g': 1000, 'g→oz': 0.03527, 'oz→g': 28.3495, 'kg→oz': 35.274, 'oz→kg': 0.02835, 'ml→L': 0.001, 'L→ml': 1000 };
function costoConvertido(cuBase, unidadOriginal, usoUnidad) {
  const o = normU(unidadOriginal), u = normU(usoUnidad);
  if (!u || !o || u === o) return cuBase;
  const f = FACTORES[`${u}→${o}`];
  return f ? cuBase * f : cuBase;
}

export default function DashboardPage() {
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const precioMode = user?.precio_decimales || 'variable';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [viewMode, setViewMode] = useState('gallery');
  const [mobileColumns, setMobileColumns] = useState(() => localStorage.getItem('kudi_mobile_cols') === '1' ? 1 : 2);
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
      lines.push([esc('RESUMEN DE PRODUCTOS Kudi'), '', '', '', '', '', '', ''].join(sep));
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
            const cuBase = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
            const cu = costoConvertido(cuBase, ins.unidad_medida, ins.uso_unidad);
            const cant = parseFloat(ins.cantidad_usada || ins.cantidad) || 0;
            const sub = cu * cant;
            totalPrep += sub;
            lines.push([
              ins.nombre || '',
              ins.uso_unidad || ins.unidad_medida || '',
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
      a.download = `recetas_kudi_${new Date().toISOString().slice(0, 10)}.csv`;
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
      {/* Header — Apple style */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-stone-900">Mis productos</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setViewMode('gallery')}
            className={`${cx.btnIcon} ${viewMode === 'gallery' ? 'text-[var(--accent)]' : ''}`}
            title="Vista galeria"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`${cx.btnIcon} ${viewMode === 'table' ? 'text-[var(--accent)]' : ''}`}
            title="Vista lista"
          >
            <LayoutList size={18} />
          </button>
          <button
            onClick={() => {
              const next = mobileColumns === 2 ? 1 : 2;
              setMobileColumns(next);
              localStorage.setItem('kudi_mobile_cols', String(next));
            }}
            className={`${cx.btnIcon} sm:hidden`}
            title={mobileColumns === 2 ? 'Una columna' : 'Dos columnas'}
          >
            {mobileColumns === 2 ? <Square size={18} /> : <Columns2 size={18} />}
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting}
            className={cx.btnSecondary + ' flex items-center gap-2'}
            title="Exportar recetas completas"
          >
            {exporting ? <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /> : <Download size={16} />}
          </button>
          <button
            onClick={() => navigate('/cotizador')}
            className={cx.btnPrimary + ' flex items-center gap-2'}
          >
            <Plus size={16} />
            Nuevo
          </button>
        </div>
      </div>

      {/* Search — Airbnb style */}
      {products.length > 0 && (
        <div className="relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className={cx.input + ' pl-11'}
          />
        </div>
      )}

      {(() => {
        const presentacionesEnteras = filtered.filter((p) => p.tipo_presentacion === 'entero');
        const productosUnidad = filtered.filter((p) => p.tipo_presentacion !== 'entero');

        const renderGalleryGrid = (prods) => (
          <div className={`grid ${mobileColumns === 2 ? 'grid-cols-2' : 'grid-cols-1'} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4`}>
            {prods.map((p) => (
              <div key={p.id} className={`${cx.cardHover} overflow-hidden group relative`} onClick={() => handleDetail(p)}>
                {p.tipo_presentacion === 'entero' && p.unidades_por_producto > 1 && (
                  <span className="absolute top-2 left-2 bg-[var(--accent)] text-white text-[10px] font-bold px-2 py-0.5 rounded-lg z-10">
                    {p.unidades_por_producto} porciones
                  </span>
                )}
                {p.imagen_url ? (
                  <div className="aspect-[4/3] bg-stone-100 rounded-t-xl overflow-hidden">
                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-stone-100 rounded-t-xl flex items-center justify-center">
                    <Package size={32} className="text-stone-300" />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-stone-900 truncate">{p.nombre}</h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-stone-400 text-xs">Margen: {formatPercent(p.margen)}</span>
                    <span className="text-[var(--accent)] font-bold text-sm">{formatCurrency(precioComercial(p.precio_final, precioMode))}</span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleDuplicate(p)} className="bg-white/80 backdrop-blur rounded-lg p-1.5 text-stone-500 hover:text-stone-800" title="Duplicar">
                    <Copy size={13} />
                  </button>
                  <button onClick={() => handleHistory(p)} className="bg-white/80 backdrop-blur rounded-lg p-1.5 text-stone-500 hover:text-stone-800" title="Historial">
                    <History size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="bg-white/80 backdrop-blur rounded-lg p-1.5 text-stone-500 hover:text-rose-600" title="Eliminar">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );

        const renderMobileCards = (prods) => (
          <div className="space-y-3 lg:hidden">
            {prods.map((p) => (
              <div key={p.id} className={`${cx.card} p-4`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-stone-800 font-medium text-sm truncate">{p.nombre}</h3>
                    <p className="text-stone-500 text-xs mt-0.5">{formatDate(p.updated_at)}</p>
                  </div>
                  <span className="text-[var(--accent)] font-bold text-lg">{formatCurrency(precioComercial(p.precio_final, precioMode))}</span>
                </div>
                <div className="flex gap-4 text-xs text-stone-500 mb-3">
                  <span>Costo: {formatCurrency(p.costo_neto)}</span>
                  <span>Margen: {formatPercent(p.margen)}</span>
                </div>
                <div className="flex gap-2 border-t border-stone-200 pt-3">
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
        );

        const renderTable = (prods) => (
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th}>Tipo</th>
                  <th className={cx.th}>Costo Neto</th>
                  <th className={cx.th}>Margen</th>
                  <th className={cx.th}>Precio Final</th>
                  <th className={cx.th}>Actualizado</th>
                  <th className={cx.th + ' text-right'}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {prods.map((p) => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={cx.td + ' text-stone-800 font-medium'}>{p.nombre}</td>
                    <td className={cx.td + ' text-stone-500 text-xs'}>
                      {p.tipo_presentacion === 'entero'
                        ? `Entero${p.unidades_por_producto > 1 ? ` (${p.unidades_por_producto})` : ''}`
                        : 'Unidad'}
                    </td>
                    <td className={cx.td + ' text-stone-600'}>{formatCurrency(p.costo_neto)}</td>
                    <td className={cx.td + ' text-stone-600'}>{formatPercent(p.margen)}</td>
                    <td className={cx.td + ' text-[var(--accent)] font-semibold'}>{formatCurrency(p.precio_final)}</td>
                    <td className={cx.td + ' text-stone-400'}>{formatDate(p.updated_at)}</td>
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
                        <button onClick={() => setDeleteTarget(p)} className={cx.btnIcon + ' hover:text-rose-600'} title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        const renderSection = (prods, label) => {
          if (prods.length === 0) return null;
          return (
            <div className={label === 'Presentaciones enteras' ? 'mb-8' : ''}>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">{label} ({prods.length})</p>
              {viewMode === 'gallery' && renderGalleryGrid(prods)}
              {viewMode === 'table' && (
                <>
                  {renderMobileCards(prods)}
                  {renderTable(prods)}
                </>
              )}
            </div>
          );
        };

        if (filtered.length === 0 && !loading) {
          return (
            <div className={`${cx.card} p-12 text-center`}>
              <Package size={40} className="mx-auto text-stone-300 mb-3" />
              <p className="text-stone-500 text-sm">
                {products.length === 0
                  ? 'Aun no tienes productos. Crea tu primer cotizacion.'
                  : 'No se encontraron productos.'}
              </p>
            </div>
          );
        }

        return (
          <>
            {renderSection(presentacionesEnteras, 'Presentaciones enteras')}
            {renderSection(productosUnidad, 'Por unidad')}
          </>
        );
      })()}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"? Esta accion no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* History modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setHistoryModal(null); setSelectedVersion(null); setConfirmRestore(null); }} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl p-6">
            <h3 className="text-lg font-bold text-stone-900 mb-4">Historial: {historyModal.nombre}</h3>

            {history.length === 0 ? (
              <p className="text-stone-400 text-sm">Sin historial disponible.</p>
            ) : confirmRestore ? (
              /* Confirmation step */
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-amber-600 text-sm font-medium mb-1">Confirmar restauracion</p>
                  <p className="text-stone-600 text-sm">
                    Vas a revertir <strong>{historyModal.nombre}</strong> a la <strong>version {confirmRestore.version}</strong> ({confirmRestore.motivo}).
                  </p>
                  <p className="text-stone-400 text-xs mt-2">Se creara una nueva version con los valores restaurados. Los datos actuales no se pierden.</p>
                </div>
                <div className="flex gap-3">
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
                  <h4 className="text-sm font-semibold text-stone-800">Version {selectedVersion.version} — {selectedVersion.motivo}</h4>
                  <span className="text-stone-400 text-xs">{formatDate(selectedVersion.created_at)}</span>
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
                    <div className="border border-stone-100 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-stone-50">
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Campo</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Esta version</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Actual</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cambio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((f) => {
                            const snapVal = snap[f.key];
                            const currVal = current[f.key];
                            const changed = String(snapVal) !== String(currVal);
                            const display = f.fmt || ((v) => v ?? '-');
                            // Variacion: actual vs esta version
                            let variacion = null;
                            if (f.key !== 'nombre' && changed) {
                              const sv = Number(snapVal) || 0;
                              const cv = Number(currVal) || 0;
                              const diff = cv - sv;
                              if (f.key === 'margen') {
                                const svPct = sv < 1 ? sv * 100 : sv;
                                const cvPct = cv < 1 ? cv * 100 : cv;
                                const d = cvPct - svPct;
                                variacion = { value: d, text: `${d > 0 ? '+' : ''}${d.toFixed(1)}pp` };
                              } else {
                                variacion = { value: diff, text: `${diff > 0 ? '+' : ''}${formatCurrency(diff)}` };
                              }
                            }
                            return (
                              <tr key={f.key} className="border-t border-stone-100">
                                <td className="px-3 py-2 text-stone-500">{f.label}</td>
                                <td className="px-3 py-2 text-center text-stone-800 font-medium">{display(snapVal)}</td>
                                <td className="px-3 py-2 text-center text-stone-500">{display(currVal)}</td>
                                <td className="px-3 py-2 text-center">
                                  {variacion ? (
                                    <span className={`text-xs font-medium ${variacion.value > 0 ? 'text-[var(--success)]' : variacion.value < 0 ? 'text-rose-600' : 'text-stone-400'}`}>
                                      {variacion.text}
                                    </span>
                                  ) : changed ? (
                                    <span className="text-amber-600 text-xs">Cambio</span>
                                  ) : (
                                    <span className="text-stone-400 text-xs">--</span>
                                  )}
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
                    className="w-full text-left border-l-2 border-stone-200 hover:border-[var(--accent)] pl-3 py-2 rounded-r-lg hover:bg-stone-50 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-stone-800">
                          {i === 0 && <span className="text-[10px] bg-[var(--accent-light)] text-[var(--success)] px-1.5 py-0.5 rounded mr-2">Actual</span>}
                          Version {h.version}
                        </p>
                        <p className="text-xs text-stone-400">{h.motivo}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-stone-400">{formatDate(h.created_at)}</p>
                        {h.precio_final && <p className="text-xs text-[var(--accent)]">{formatCurrency(h.precio_final)}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => { setHistoryModal(null); setSelectedVersion(null); setConfirmRestore(null); }} className={cx.btnSecondary + ' mt-6 w-full'}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Detail modal — Airbnb listing style */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setDetailModal(null); setDetailData(null); }} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">

            {/* Header with image */}
            {detailModal.imagen_url ? (
              <div className="aspect-[3/1] bg-stone-100 rounded-t-2xl overflow-hidden">
                <img src={detailModal.imagen_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-[3/1] bg-stone-100 rounded-t-2xl flex items-center justify-center">
                <Package size={48} className="text-stone-300" />
              </div>
            )}

            {/* Content */}
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">{detailModal.nombre}</h2>
                  <p className="text-sm text-stone-500 mt-1">Margen: {formatPercent(detailModal.margen)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-stone-900">{formatCurrency(precioComercial(detailModal.precio_final, precioMode))}</p>
                  <p className="text-xs text-stone-400">Precio sugerido</p>
                </div>
              </div>

              {!detailData ? (
                <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className={cx.skeleton + ' h-10'} />)}</div>
              ) : (
                <>
                  {/* Preparaciones */}
                  {(detailData.preparaciones || []).map((prep, pi) => (
                    <div key={pi} className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-stone-800">{prep.nombre || `Preparacion ${pi + 1}`}</h4>
                        {prep.capacidad && <span className="text-xs text-stone-400">{parseFloat(prep.capacidad)} {prep.unidad_capacidad || ''}</span>}
                      </div>
                      <div className="border border-stone-100 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-stone-50">
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Insumo</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cant.</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">C.Unit</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(prep.insumos || []).map((ins, ii) => {
                              const cuBase = Number(ins.cantidad_presentacion) > 0 ? Number(ins.precio_presentacion) / Number(ins.cantidad_presentacion) : 0;
                              const cu = costoConvertido(cuBase, ins.unidad_medida, ins.uso_unidad);
                              const cant = parseFloat(ins.cantidad_usada || ins.cantidad) || 0;
                              return (
                                <tr key={ii} className="border-t border-stone-100">
                                  <td className="px-3 py-2 text-stone-800">{ins.nombre} <span className="text-stone-400 text-xs">{ins.uso_unidad || ins.unidad_medida}</span></td>
                                  <td className="px-3 py-2 text-center text-stone-600">{cant}</td>
                                  <td className="px-3 py-2 text-center text-stone-500">{formatCurrency(cu)}</td>
                                  <td className="px-3 py-2 text-right text-stone-800">{formatCurrency(cu * cant)}</td>
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
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-stone-800">Empaque / Materiales</h4>
                      </div>
                      <div className="border border-stone-100 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-stone-50">
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Material</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cant.</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">P.Unit</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detailData.materiales || []).map((mat, mi) => {
                              const pu = Number(mat.cantidad_presentacion) > 0 ? Number(mat.precio_presentacion) / Number(mat.cantidad_presentacion) : 0;
                              const cant = parseFloat(mat.cantidad) || 0;
                              return (
                                <tr key={mi} className="border-t border-stone-100">
                                  <td className="px-3 py-2 text-stone-800">{mat.nombre} <span className="text-stone-400 text-xs">{mat.unidad_medida}</span></td>
                                  <td className="px-3 py-2 text-center text-stone-600">{cant}</td>
                                  <td className="px-3 py-2 text-center text-stone-500">{formatCurrency(pu)}</td>
                                  <td className="px-3 py-2 text-right text-stone-800">{formatCurrency(pu * cant)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Cost summary */}
                  <div className="border-t border-stone-200 pt-5 mt-5 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Costo insumos</span><span className="text-stone-800 font-medium">{formatCurrency(detailData.costo_insumos)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Costo empaque</span><span className="text-stone-800 font-medium">{formatCurrency(detailData.costo_empaque)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Costo neto</span><span className="text-stone-800 font-medium">{formatCurrency(detailData.costo_neto)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Margen</span><span className="text-stone-800 font-medium">{formatPercent(detailData.margen)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">IGV ({(Number(detailData.igv_rate) < 1 ? Number(detailData.igv_rate) * 100 : Number(detailData.igv_rate)).toFixed(1)}%)</span><span className="text-stone-800 font-medium">{formatCurrency(Number(detailData.precio_final) - Number(detailData.precio_venta))}</span></div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-stone-100">
                      <span className="text-stone-800">Precio final</span>
                      <span className="text-stone-900">{formatCurrency(detailData.precio_final)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-400">Sugerido</span>
                      <span className="text-[var(--success)] font-semibold">{formatCurrency(precioComercial(detailData.precio_final, precioMode))}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => navigate(`/cotizador/${detailModal.id}`)} className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-2'}>
                      <Pencil size={14} /> Editar
                    </button>
                    <button onClick={() => { setDetailModal(null); setDetailData(null); }} className={cx.btnSecondary + ' flex-1'}>Cerrar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
