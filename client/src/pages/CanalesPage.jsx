import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, Pencil, Truck, MapPin, Check, CheckCheck, Package,
} from 'lucide-react';

export default function CanalesPage() {
  const api = useApi();
  const toast = useToast();

  const [canales, setCanales] = useState([]);
  const [productos, setProductos] = useState([]);
  const [activeTab, setActiveTab] = useState('directa');
  const [loading, setLoading] = useState(true);

  // Product-channel state
  const [preciosCanal, setPreciosCanal] = useState({});
  const [productosEnCanal, setProductosEnCanal] = useState(new Set());

  // Zonas de envio
  const [zonas, setZonas] = useState([]);
  const [showZonaForm, setShowZonaForm] = useState(false);
  const [zonaForm, setZonaForm] = useState({});
  const [zonaEditingId, setZonaEditingId] = useState(null);

  // Create channel
  const [showCreate, setShowCreate] = useState(false);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: '', comision_pct: '' });

  // Edit channel
  const [editingCanal, setEditingCanal] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', comision_pct: '' });

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ─── Data Loading ───

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [canalesRes, prodsRes, zonasRes] = await Promise.all([
        api.get('/canales').catch(() => ({ data: [] })),
        api.get('/productos').catch(() => ({ data: [] })),
        api.get('/canales/zonas').catch(() => ({ data: [] })),
      ]);
      setCanales(canalesRes.data || []);
      setProductos((prodsRes.data || []).filter(p => !p.locked));
      setZonas(zonasRes.data || []);
    } catch {
      // silently handled
    } finally {
      setLoading(false);
    }
  }

  // Load channel prices when switching tabs
  useEffect(() => {
    if (activeTab === 'directa' || activeTab === 'zonas') return;
    loadCanalPrecios(activeTab);
  }, [activeTab, productos]);

  const loadCanalPrecios = useCallback((canalId) => {
    const preciosMap = {};
    const enCanal = new Set();
    for (const p of productos) {
      const cp = (p.precios_canal || []).find(c => c.canal_id === parseInt(canalId));
      if (cp) {
        preciosMap[p.id] = parseFloat(cp.precio_override);
        enCanal.add(p.id);
      }
    }
    setPreciosCanal(preciosMap);
    setProductosEnCanal(enCanal);
  }, [productos]);

  // ─── Channel CRUD ───

  async function createCanal() {
    if (!createForm.nombre?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      const body = {
        nombre: createForm.nombre.trim(),
        comision_pct: parseFloat(createForm.comision_pct) || 0,
      };
      await api.post('/canales', body);
      toast.success('Canal creado');
      const res = await api.get('/canales');
      const newCanales = res.data || [];
      setCanales(newCanales);
      // Switch to new tab
      const newCanal = newCanales.find(c => c.nombre === body.nombre);
      if (newCanal) setActiveTab(String(newCanal.id));
      setShowCreate(false);
      setCreateForm({ nombre: '', comision_pct: '' });
    } catch (err) {
      toast.error(err.message || 'Error creando canal');
    } finally {
      setSaving(false);
    }
  }

  async function saveEditCanal() {
    if (!editForm.nombre?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      await api.put(`/canales/${editingCanal.id}`, {
        nombre: editForm.nombre.trim(),
        comision_pct: parseFloat(editForm.comision_pct) || 0,
      });
      toast.success('Canal actualizado');
      const res = await api.get('/canales');
      setCanales(res.data || []);
      setEditingCanal(null);
    } catch (err) {
      toast.error(err.message || 'Error actualizando canal');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCanal() {
    if (!deleteTarget) return;
    try {
      await api.del(`/canales/${deleteTarget.id}`);
      toast.success('Canal eliminado');
      setCanales(prev => prev.filter(c => c.id !== deleteTarget.id));
      if (activeTab === String(deleteTarget.id)) setActiveTab('directa');
    } catch (err) {
      toast.error(err.message || 'Error eliminando canal');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Product-Channel Operations ───

  async function toggleProductoEnCanal(productoId, checked) {
    const canalId = parseInt(activeTab);
    const canal = canales.find(c => c.id === canalId);
    const comision = parseFloat(canal?.comision_pct) || 0;
    try {
      if (checked) {
        const prod = productos.find(p => p.id === productoId);
        const precio = comision < 100
          ? Math.round((parseFloat(prod.precio_final) / (1 - comision / 100)) * 100) / 100
          : parseFloat(prod.precio_final);

        await api.put(`/canales/precios/${productoId}`, { canal_id: canalId, precio_override: precio });
        setProductosEnCanal(prev => new Set([...prev, productoId]));
        setPreciosCanal(prev => ({ ...prev, [productoId]: precio }));
        // Update productos state so precios_canal stays in sync
        setProductos(prev => prev.map(p => p.id === productoId ? {
          ...p, precios_canal: [...(p.precios_canal || []), { canal_id: canalId, canal_nombre: canal?.nombre, precio_override: String(precio), comision_pct: String(comision) }]
        } : p));
        toast.success('Producto agregado');
      } else {
        await api.put(`/canales/precios/${productoId}`, { canal_id: canalId, precio_override: null });
        setProductosEnCanal(prev => { const n = new Set(prev); n.delete(productoId); return n; });
        setPreciosCanal(prev => { const n = { ...prev }; delete n[productoId]; return n; });
        // Update productos state
        setProductos(prev => prev.map(p => p.id === productoId ? {
          ...p, precios_canal: (p.precios_canal || []).filter(pc => pc.canal_id !== canalId)
        } : p));
        toast.success('Producto removido');
      }
    } catch (err) {
      toast.error(err.message || 'Error');
    }
  }

  async function updatePrecioCanal(productoId, nuevoPrecio) {
    const canalId = parseInt(activeTab);
    try {
      await api.put(`/canales/precios/${productoId}`, { canal_id: canalId, precio_override: parseFloat(nuevoPrecio) });
      setPreciosCanal(prev => ({ ...prev, [productoId]: parseFloat(nuevoPrecio) }));
      // Refresh productos
      const res = await api.get('/productos');
      setProductos((res.data || []).filter(p => !p.locked));
    } catch (err) {
      toast.error(err.message || 'Error actualizando precio');
    }
  }

  async function selectAll() {
    const canalId = parseInt(activeTab);
    const canal = canales.find(c => c.id === canalId);
    const comision = parseFloat(canal?.comision_pct) || 0;
    setSaving(true);
    try {
      for (const p of productos) {
        if (!productosEnCanal.has(p.id)) {
          const precio = comision < 100
            ? Math.round((parseFloat(p.precio_final) / (1 - comision / 100)) * 100) / 100
            : parseFloat(p.precio_final);
          await api.put(`/canales/precios/${p.id}`, { canal_id: canalId, precio_override: precio });
        }
      }
      const res = await api.get('/productos');
      setProductos((res.data || []).filter(p => !p.locked));
      loadCanalPrecios(activeTab);
      toast.success('Todos los productos agregados');
    } catch (err) {
      toast.error(err.message || 'Error agregando productos');
    } finally {
      setSaving(false);
    }
  }

  async function deselectAll() {
    const canalId = parseInt(activeTab);
    setSaving(true);
    try {
      for (const p of productos) {
        if (productosEnCanal.has(p.id)) {
          await api.put(`/canales/precios/${p.id}`, { canal_id: canalId, precio_override: null });
        }
      }
      const res = await api.get('/productos');
      setProductos((res.data || []).filter(p => !p.locked));
      setPreciosCanal({});
      setProductosEnCanal(new Set());
      toast.success('Todos los productos removidos');
    } catch (err) {
      toast.error(err.message || 'Error removiendo productos');
    } finally {
      setSaving(false);
    }
  }

  // ─── Zonas CRUD ───

  function openNewZona() {
    setZonaForm({ nombre: '', costo: '' });
    setZonaEditingId(null);
    setShowZonaForm(true);
  }

  function openEditZona(z) {
    setZonaForm({ nombre: z.nombre, costo: z.costo ?? '' });
    setZonaEditingId(z.id);
    setShowZonaForm(true);
  }

  function resetZonaForm() {
    setZonaForm({});
    setZonaEditingId(null);
    setShowZonaForm(false);
  }

  async function saveZona() {
    if (!zonaForm.nombre?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      const body = {
        nombre: zonaForm.nombre.trim(),
        costo: parseFloat(zonaForm.costo) || 0,
      };
      if (zonaEditingId) {
        await api.put(`/canales/zonas/${zonaEditingId}`, body);
        toast.success('Zona actualizada');
      } else {
        await api.post('/canales/zonas', body);
        toast.success('Zona creada');
      }
      const res = await api.get('/canales/zonas');
      setZonas(res.data || []);
      resetZonaForm();
    } catch (err) {
      toast.error(err.message || 'Error guardando zona');
    } finally {
      setSaving(false);
    }
  }

  async function deleteZona() {
    if (!deleteTarget) return;
    try {
      await api.del(`/canales/zonas/${deleteTarget.id}`);
      toast.success('Zona eliminada');
      setZonas(prev => prev.filter(z => z.id !== deleteTarget.id));
    } catch (err) {
      toast.error(err.message || 'Error eliminando zona');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Helpers ───

  function startEditCanal(c) {
    setEditingCanal(c);
    setEditForm({ nombre: c.nombre, comision_pct: c.comision_pct ?? '' });
  }

  const activeCanal = canales.find(c => String(c.id) === activeTab);

  // ─── Loading ───

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className={cx.skeleton + ' h-12 w-full'} />
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  // ─── Render ───

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <h1 className="text-xl font-bold text-stone-900">Canales de venta</h1>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1 flex-wrap mb-4">
        <button
          onClick={() => setActiveTab('directa')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'directa'
              ? 'bg-[#0A2F24] text-white'
              : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
          }`}
        >
          Venta Directa
        </button>

        {canales.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveTab(String(c.id))}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === String(c.id)
                ? 'bg-[#0A2F24] text-white'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            {c.nombre}
            <span className="opacity-60 ml-1">{c.comision_pct}%</span>
          </button>
        ))}

        <button
          onClick={() => setActiveTab('zonas')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'zonas'
              ? 'bg-[#0A2F24] text-white'
              : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
          }`}
        >
          Zonas de envio
        </button>

        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:opacity-90 flex items-center gap-1"
        >
          <Plus size={12} /> Canal
        </button>
      </div>

      {/* ─── Create Channel Modal ─── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900">Nuevo canal</h3>
              <button onClick={() => setShowCreate(false)} className={cx.btnIcon}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={cx.label}>Nombre</label>
                <input
                  type="text"
                  value={createForm.nombre}
                  onChange={e => setCreateForm(f => ({ ...f, nombre: e.target.value }))}
                  className={cx.input}
                  placeholder="Rappi, PedidosYa..."
                />
              </div>
              <div>
                <label className={cx.label}>Comision %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={createForm.comision_pct}
                  onChange={e => setCreateForm(f => ({ ...f, comision_pct: e.target.value }))}
                  className={cx.input}
                  placeholder="30"
                />
                <p className="text-[10px] text-stone-400 mt-1">Ej: 30% = precio x 1.43</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowCreate(false)} className={cx.btnSecondary}>Cancelar</button>
              <button onClick={createCanal} disabled={saving} className={cx.btnPrimary}>
                {saving ? 'Creando...' : 'Crear canal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: Venta Directa ─── */}
      {activeTab === 'directa' && (
        <div>
          {productos.length === 0 ? (
            <div className={`${cx.card} p-12 text-center`}>
              <Truck size={40} className="text-stone-300 mx-auto mb-4" />
              <p className="text-stone-400 text-sm">No hay productos registrados</p>
            </div>
          ) : (
            <div className={cx.card + ' overflow-hidden'}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className={cx.th}>Producto</th>
                    <th className={cx.th + ' text-right'}>Precio tienda</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} className={cx.tr}>
                      <td className={cx.td + ' font-medium text-stone-800'}>{p.nombre}</td>
                      <td className={cx.td + ' text-right text-[var(--accent)] font-semibold'}>
                        {formatCurrency(p.precio_final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Channel ─── */}
      {activeTab !== 'directa' && activeTab !== 'zonas' && activeCanal && (
        <div>
          {/* Channel info header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            {editingCanal?.id === activeCanal.id ? (
              /* Inline edit */
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                  className={cx.input + ' !w-40'}
                  placeholder="Nombre"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.comision_pct}
                  onChange={e => setEditForm(f => ({ ...f, comision_pct: e.target.value }))}
                  className={cx.input + ' !w-24'}
                  placeholder="%"
                />
                <button onClick={saveEditCanal} disabled={saving} className={cx.btnPrimary + ' text-xs !px-3 !py-1.5'}>
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setEditingCanal(null)} className={cx.btnGhost + ' text-xs !px-2 !py-1.5'}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cx.badge('bg-amber-50 text-amber-600')}>
                  Comision: {activeCanal.comision_pct}%
                </span>
                <span className="text-xs text-stone-400">
                  {productosEnCanal.size} producto{productosEnCanal.size !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            <div className="flex gap-1 flex-wrap">
              <button onClick={selectAll} disabled={saving} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                <CheckCheck size={12} /> Seleccionar todos
              </button>
              <button onClick={deselectAll} disabled={saving} className={cx.btnGhost + ' text-xs'}>
                Deseleccionar
              </button>
              {!editingCanal && (
                <>
                  <button onClick={() => startEditCanal(activeCanal)} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ ...activeCanal, _type: 'canal' })}
                    className={cx.btnDanger + ' text-xs flex items-center gap-1'}
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Products in this channel */}
          {(() => {
            const prodsEnCanal = productos.filter(p => productosEnCanal.has(p.id));
            const prodsNoEnCanal = productos.filter(p => !productosEnCanal.has(p.id));
            const comision = parseFloat(activeCanal.comision_pct) || 0;

            return (
              <>
                {/* Add products button */}
                {prodsNoEnCanal.length > 0 && (
                  <button onClick={() => setShowAddProducts(true)} className={cx.btnPrimary + ' text-xs flex items-center gap-1 mb-3'}>
                    <Plus size={14} /> Agregar productos ({prodsNoEnCanal.length} disponibles)
                  </button>
                )}

                {prodsEnCanal.length === 0 ? (
                  <div className={`${cx.card} p-12 text-center`}>
                    <Package size={32} className="text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-400 text-sm mb-3">No hay productos en este canal</p>
                    <button onClick={() => setShowAddProducts(true)} className={cx.btnPrimary + ' text-xs'}>
                      Agregar productos
                    </button>
                  </div>
                ) : (
                  <div className={cx.card + ' divide-y divide-stone-100'}>
                    {prodsEnCanal.map(p => {
                      const precio = parseFloat(preciosCanal[p.id]) || 0;
                      const calculado = comision < 100 ? parseFloat(p.precio_final) / (1 - comision / 100) : parseFloat(p.precio_final);
                      const subsidiando = precio > 0 && precio < calculado * 0.99;

                      return (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-800 truncate">{p.nombre}</p>
                            <p className="text-[10px] text-stone-400">
                              Tienda: {formatCurrency(p.precio_final)} · Calculado: {formatCurrency(Math.round(calculado * 100) / 100)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {subsidiando && <span className="text-[9px] text-amber-500">Subsidiado</span>}
                            <input type="number" step="0.01" value={precio}
                              onChange={e => setPreciosCanal(prev => ({ ...prev, [p.id]: e.target.value }))}
                              onBlur={() => updatePrecioCanal(p.id, preciosCanal[p.id])}
                              className={`w-24 px-2 py-1 text-sm text-right border rounded ${subsidiando ? 'border-amber-300 text-amber-700' : 'border-stone-200 text-stone-800'} focus:outline-none focus:border-stone-400`}
                            />
                            <button onClick={() => toggleProductoEnCanal(p.id, false)} className={cx.btnDanger + ' p-1'} title="Remover">
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add products modal */}
                {showAddProducts && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddProducts(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-stone-900">Agregar productos a {activeCanal.nombre}</h3>
                        <button onClick={() => setShowAddProducts(false)} className={cx.btnGhost + ' p-1'}><X size={16} /></button>
                      </div>
                      <div className="space-y-1">
                        {prodsNoEnCanal.map(p => {
                          const calc = comision < 100 ? Math.round((parseFloat(p.precio_final) / (1 - comision / 100)) * 100) / 100 : parseFloat(p.precio_final);
                          return (
                            <div key={p.id} className="flex items-center justify-between py-2 px-3 hover:bg-stone-50 rounded-lg">
                              <div>
                                <p className="text-sm text-stone-800">{p.nombre}</p>
                                <p className="text-[10px] text-stone-400">Tienda: {formatCurrency(p.precio_final)} → Canal: {formatCurrency(calc)}</p>
                              </div>
                              <button onClick={async () => { await toggleProductoEnCanal(p.id, true); }} className={cx.btnPrimary + ' text-[10px] !px-2 !py-1'}>
                                Agregar
                              </button>
                            </div>
                          );
                        })}
                        {prodsNoEnCanal.length === 0 && (
                          <p className="text-center text-sm text-stone-400 py-4">Todos los productos ya están en este canal</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ─── Tab: Zonas de envio ─── */}
      {activeTab === 'zonas' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openNewZona} className={cx.btnPrimary + ' flex items-center gap-2'}>
              <Plus size={14} /> Nueva zona
            </button>
          </div>

          {/* Zona form */}
          {showZonaForm && (
            <div className={`${cx.card} p-5 mb-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-900">
                  {zonaEditingId ? 'Editar zona' : 'Nueva zona'}
                </h3>
                <button onClick={resetZonaForm} className={cx.btnIcon}><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input
                    type="text"
                    value={zonaForm.nombre || ''}
                    onChange={e => setZonaForm(f => ({ ...f, nombre: e.target.value }))}
                    className={cx.input}
                    placeholder="Centro, Norte, Sur..."
                  />
                </div>
                <div>
                  <label className={cx.label}>Costo (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={zonaForm.costo || ''}
                    onChange={e => setZonaForm(f => ({ ...f, costo: e.target.value }))}
                    className={cx.input}
                    placeholder="5.00"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveZona} disabled={saving} className={cx.btnPrimary}>
                  {saving ? 'Guardando...' : zonaEditingId ? 'Guardar cambios' : 'Crear zona'}
                </button>
                <button onClick={resetZonaForm} className={cx.btnSecondary}>Cancelar</button>
              </div>
            </div>
          )}

          {zonas.length === 0 ? (
            <div className={`${cx.card} p-12 text-center`}>
              <MapPin size={40} className="text-stone-300 mx-auto mb-4" />
              <p className="text-stone-400 text-sm">No hay zonas de envio registradas</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={`${cx.card} hidden lg:block overflow-hidden`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className={cx.th}>Nombre</th>
                      <th className={cx.th + ' text-right'}>Costo</th>
                      <th className={cx.th + ' w-24'}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonas.map(z => (
                      <tr key={z.id} className={cx.tr}>
                        <td className={cx.td + ' font-medium text-stone-900'}>{z.nombre}</td>
                        <td className={cx.td + ' text-right text-stone-600'}>{formatCurrency(z.costo)}</td>
                        <td className={cx.td}>
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEditZona(z)} className={cx.btnIcon}><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget({ ...z, _type: 'zona' })} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3">
                {zonas.map(z => (
                  <div key={z.id} className={`${cx.card} p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{z.nombre}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{formatCurrency(z.costo)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditZona(z)} className={cx.btnIcon}><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget({ ...z, _type: 'zona' })} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?._type === 'zona' ? 'Eliminar zona' : 'Eliminar canal'}
        message={`Estas seguro de eliminar "${deleteTarget?.nombre}"?`}
        onConfirm={deleteTarget?._type === 'zona' ? deleteZona : deleteCanal}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
