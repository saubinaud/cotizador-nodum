import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import SearchableSelect from '../components/SearchableSelect';
import CustomSelect from '../components/CustomSelect';
import PeriodoSelector from '../components/PeriodoSelector';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, Pencil, ChevronDown, ChevronUp,
  DollarSign, TrendingUp, Package, ShoppingCart, FileText,
} from 'lucide-react';

// Month names in Spanish
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const fin = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { nombre: `${MESES[m]} ${y}`, fecha_inicio: inicio, fecha_fin: fin };
}

export default function PLVentasPage() {
  const api = useApi();
  const toast = useToast();

  // Data
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [productos, setProductos] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVenta, setEditingVenta] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [creatingPeriodo, setCreatingPeriodo] = useState(false);

  // Emitir comprobante state
  const [emitirModal, setEmitirModal] = useState(null);
  const [emitirTipo, setEmitirTipo] = useState('boleta');
  const [emitirClienteId, setEmitirClienteId] = useState('');
  const [emitirClientes, setEmitirClientes] = useState([]);
  const [emitting, setEmitting] = useState(false);

  // Venta client state
  const [ventaClientes, setVentaClientes] = useState([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({});

  // Modal form
  const [form, setForm] = useState({
    fecha: todayStr(),
    nota: '',
    cuenta_id: '',
    cliente_id: '',
  });
  const [ventaItems, setVentaItems] = useState([{ _id: Date.now(), producto_id: null, cantidad: 1, precio_unitario: '', descuento: 0 }]);
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [contraEntrega, setContraEntrega] = useState(false);
  const [adelanto, setAdelanto] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [cuentas, setCuentas] = useState([]);

  // Vendedor state
  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState('');

  // Shipping state
  const [tieneEnvio, setTieneEnvio] = useState(false);
  const [tipoEnvio, setTipoEnvio] = useState('propio');
  const [costoEnvio, setCostoEnvio] = useState('');
  const [zonaEnvioId, setZonaEnvioId] = useState('');
  const [direccionEnvio, setDireccionEnvio] = useState('');
  const [canalId, setCanalId] = useState('');
  const [zonas, setZonas] = useState([]);
  const [canales, setCanales] = useState([]);

  // Load periodos + productos on mount
  useEffect(() => {
    Promise.all([
      api.get('/pl/periodos').catch(() => ({ data: [] })),
      api.get('/productos').catch(() => ({ data: [] })),
      api.get('/flujo/cuentas').catch(() => ({ data: [] })),
      api.get('/clientes').catch(() => ({ data: [] })),
      api.get('/canales/zonas').catch(() => ({ data: [] })),
      api.get('/canales').catch(() => ({ data: [] })),
      api.get('/equipo').catch(() => ({ data: [] })),
    ]).then(([perRes, prodRes, cuentasRes, clientesRes, zonasRes, canalesRes, equipoRes]) => {
      const pers = perRes.data || [];
      setPeriodos(pers);
      setCuentas((cuentasRes.data || []).map(c => ({ value: c.id, label: c.nombre })));
      setProductos(prodRes.data || []);
      setVentaClientes((clientesRes.data || []).map(c => ({ value: c.id, label: `${c.num_doc} — ${c.razon_social || 'Sin nombre'}` })));
      setZonas(zonasRes.data || []);
      setCanales(canalesRes.data || []);
      const vends = (equipoRes.data || []).filter(m => parseFloat(m.comision_pct) > 0);
      setVendedores(vends);
      // Default to current month (Lima time)
      const now = new Date(Date.now() - 5*60*60*1000);
      setPeriodo({ year: now.getFullYear(), month: now.getMonth() + 1 });
      setLoading(false);
    });
  }, []);

  // Load ventas + resumen when periodo changes
  const loadVentas = async (p) => {
    if (!p) return;
    setLoadingVentas(true);
    try {
      const qs = `year=${p.year}&month=${p.month}`;
      const [ventasRes, resumenRes] = await Promise.all([
        api.get(`/pl/ventas?${qs}`),
        api.get(`/pl/ventas/resumen?${qs}`),
      ]);
      setVentas(ventasRes.data || []);
      setResumen(resumenRes.data || null);
    } catch {
      toast.error('Error cargando ventas');
    } finally {
      setLoadingVentas(false);
    }
  };

  useEffect(() => {
    if (periodo) loadVentas(periodo);
  }, [periodo]); // eslint-disable-line

  // Period options for CustomSelect
  const periodoOptions = useMemo(() =>
    periodos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [periodos]
  );

  // Create first period (current month)
  const crearPrimerPeriodo = async () => {
    setCreatingPeriodo(true);
    try {
      const mp = currentMonthPeriod();
      const res = await api.post('/pl/periodos', mp);
      const nuevo = res.data;
      setPeriodos([nuevo]);
      const now = new Date();
      setPeriodo({ year: now.getFullYear(), month: now.getMonth() + 1 });
      toast.success('Periodo creado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingPeriodo(false);
    }
  };

  // Item management functions
  const addItem = () => setVentaItems(prev => [...prev, { _id: Date.now(), producto_id: null, cantidad: 1, precio_unitario: '', descuento: 0 }]);

  const removeItem = (id) => setVentaItems(prev => prev.filter(i => i._id !== id));

  const updateItem = (id, field, value) => setVentaItems(prev => prev.map(i => i._id === id ? { ...i, [field]: value } : i));

  const selectProducto = (itemId, producto) => {
    setVentaItems(prev => prev.map(i => i._id === itemId ? {
      ...i,
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      precio_unitario: parseFloat(producto.precio_final) || '',
    } : i));
  };

  // Enriched productos for SearchableSelect
  const enrichedProductos = useMemo(() =>
    productos.map(p => ({
      ...p,
      value: p.id,
      label: p.nombre,
    })),
    [productos]
  );

  // Create client inline
  async function handleCreateClient() {
    if (!newClient.num_doc) return;
    try {
      const res = await api.post('/clientes', { tipo_doc: newClient.num_doc.length === 11 ? '6' : '1', ...newClient });
      const c = res.data || res;
      const newOpt = { value: c.id, label: `${c.num_doc} — ${c.razon_social || 'Sin nombre'}` };
      setVentaClientes(prev => [...prev, newOpt]);
      setForm(f => ({ ...f, cliente_id: c.id }));
      setShowNewClient(false);
      setNewClient({});
      toast.success('Cliente creado');
    } catch (err) {
      toast.error(err.message || 'Error creando cliente');
    }
  }

  // Open modal for new venta
  const openNewVenta = () => {
    setEditingVenta(null);
    setForm({
      fecha: todayStr(),
      nota: '',
      cuenta_id: '',
      cliente_id: '',
    });
    setVentaItems([{ _id: Date.now(), producto_id: null, cantidad: 1, precio_unitario: '', descuento: 0 }]);
    setDescuentoGlobal(0);
    setContraEntrega(false);
    setAdelanto('');
    setFechaEntrega('');
    setShowNewClient(false);
    setTieneEnvio(false);
    setTipoEnvio('propio');
    setCostoEnvio('');
    setZonaEnvioId('');
    setDireccionEnvio('');
    setCanalId('');
    setVendedorId('');
    setModalOpen(true);
  };

  // Open modal for editing
  const openEditVenta = (v) => {
    setEditingVenta(v);
    setForm({
      fecha: v.fecha ? v.fecha.slice(0, 10) : todayStr(),
      nota: v.nota || '',
      cuenta_id: v.cuenta_id || '',
      cliente_id: v.cliente_id || '',
    });
    // Load items
    if (v.items && v.items.length > 0) {
      setVentaItems(v.items.map(i => ({
        _id: i.id || Date.now() + Math.random(),
        producto_id: i.producto_id,
        producto_nombre: i.producto_nombre,
        cantidad: i.cantidad,
        precio_unitario: parseFloat(i.precio_unitario) || '',
        descuento: parseFloat(i.descuento) || 0,
      })));
    } else {
      // Legacy single product
      setVentaItems([{
        _id: Date.now(),
        producto_id: v.producto_id,
        producto_nombre: v.producto_nombre,
        cantidad: v.cantidad,
        precio_unitario: parseFloat(v.precio_unitario) || '',
        descuento: parseFloat(v.descuento) || 0,
      }]);
    }
    setDescuentoGlobal(parseFloat(v.descuento_global) || 0);
    setCanalId(v.canal_id || '');
    setTieneEnvio(!!v.tipo_envio);
    setTipoEnvio(v.tipo_envio || 'propio');
    setCostoEnvio(v.costo_envio ? String(v.costo_envio) : '');
    setZonaEnvioId(v.zona_envio_id || '');
    setDireccionEnvio(v.direccion_envio || '');
    setModalOpen(true);
  };

  // Computed subtotal and total
  const subtotal = ventaItems.reduce((s, i) => s + ((parseFloat(i.precio_unitario) || 0) * (parseInt(i.cantidad) || 1) - (parseFloat(i.descuento) || 0)), 0);
  const total = subtotal - descuentoGlobal + (tieneEnvio ? parseFloat(costoEnvio) || 0 : 0);

  // Save venta
  const saveVenta = async () => {
    const validItems = ventaItems.filter(i => i.producto_id);
    if (validItems.length === 0 || !form.fecha) {
      toast.error('Al menos un producto y fecha son requeridos');
      return;
    }
    try {
      const itemsPayload = validItems.map(i => ({
        producto_id: i.producto_id,
        cantidad: parseInt(i.cantidad) || 1,
        precio_unitario: parseFloat(i.precio_unitario) || 0,
        descuento: parseFloat(i.descuento) || 0,
      }));

      if (editingVenta) {
        await api.put(`/pl/ventas/${editingVenta.id}`, {
          items: itemsPayload,
          fecha: form.fecha,
          descuento_global: descuentoGlobal,
          nota: form.nota,
          cliente_id: form.cliente_id || null,
          canal_id: canalId || null,
          cuenta_id: form.cuenta_id || null,
          tipo_envio: tieneEnvio ? tipoEnvio : null,
          costo_envio: tieneEnvio ? parseFloat(costoEnvio) || 0 : 0,
          zona_envio_id: zonaEnvioId || null,
          direccion_envio: direccionEnvio || null,
        });
        toast.success('Venta actualizada');
      } else {
        await api.post('/pl/ventas', {
          items: itemsPayload,
          fecha: form.fecha,
          descuento_global: descuentoGlobal,
          nota: form.nota,
          cuenta_id: form.cuenta_id || null,
          cliente_id: form.cliente_id || null,
          tipo_envio: tieneEnvio ? tipoEnvio : null,
          costo_envio: tieneEnvio ? parseFloat(costoEnvio) || 0 : 0,
          zona_envio_id: zonaEnvioId || null,
          direccion_envio: direccionEnvio || null,
          canal_id: canalId || null,
          vendedor_id: vendedorId || null,
        });
        toast.success('Venta registrada');

        // If contra entrega, create a pedido
        if (contraEntrega) {
          try {
            const firstItem = validItems[0];
            const prod = productos.find(p => p.id === firstItem.producto_id);
            await api.post('/pedidos', {
              cliente_id: form.cliente_id || null,
              descripcion: validItems.length > 1 ? `${validItems.length} productos` : (prod?.nombre || 'Pedido'),
              items: validItems.map(i => ({
                producto_id: i.producto_id,
                cantidad: parseInt(i.cantidad) || 1,
                precio_unitario: parseFloat(i.precio_unitario) || 0,
              })),
              monto_total: subtotal,
              tipo_pago: 'contra_entrega',
              adelanto: parseFloat(adelanto) || 0,
              fecha_entrega_estimada: fechaEntrega || null,
              metodo_pago: 'efectivo',
              cuenta_id: form.cuenta_id || null,
            });
            toast.success('Pedido contra entrega creado');
          } catch (pedidoErr) {
            toast.error('Venta registrada pero error creando pedido: ' + (pedidoErr.message || ''));
          }
        }
      }
      setModalOpen(false);
      setContraEntrega(false);
      setAdelanto('');
      setFechaEntrega('');
      setTieneEnvio(false);
      setTipoEnvio('propio');
      setCostoEnvio('');
      setZonaEnvioId('');
      setDireccionEnvio('');
      setCanalId('');
      setVendedorId('');
      setVentaItems([{ _id: Date.now(), producto_id: null, cantidad: 1, precio_unitario: '', descuento: 0 }]);
      setDescuentoGlobal(0);
      loadVentas(periodo);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Delete venta
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/pl/ventas/${deleteTarget.id}`);
      toast.success('Venta eliminada');
      loadVentas(periodo);
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Emitir comprobante handlers
  function openEmitirModal(venta) {
    setEmitirModal(venta);
    setEmitirTipo('boleta');
    setEmitirClienteId('');
    api.get('/clientes').then(res => {
      setEmitirClientes((res.data || res || []).map(c => ({ value: c.id, label: `${c.num_doc} - ${c.razon_social || ''}` })));
    }).catch(() => {});
  }

  async function handleEmitir() {
    if (!emitirModal) return;
    setEmitting(true);
    try {
      const emitirItems = (emitirModal.items || [{ producto_id: emitirModal.producto_id, producto_nombre: emitirModal.producto_nombre, cantidad: emitirModal.cantidad, precio_unitario: emitirModal.precio_unitario, descuento: emitirModal.descuento || 0 }])
        .map(i => ({
          producto_id: i.producto_id,
          producto_nombre: i.producto_nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento: i.descuento || 0,
        }));

      const res = await api.post('/facturacion/emitir', {
        venta_id: emitirModal.id,
        tipo: emitirTipo,
        cliente_id: emitirClienteId || null,
        items: emitirItems,
      });
      const data = res.data || res;
      if (data.sunat?.success) {
        toast.success(`${emitirTipo === 'factura' ? 'Factura' : 'Boleta'} emitida: ${data.comprobante?.serie}-${data.comprobante?.correlativo}`);
      } else {
        toast.error(`SUNAT: ${data.sunat?.message || 'Error desconocido'}`);
      }
      setEmitirModal(null);
      loadVentas(periodo);
    } catch (err) {
      toast.error(err.message || 'Error emitiendo');
    } finally {
      setEmitting(false);
    }
  }

  // Summary computed values
  const utilidadBruta = resumen
    ? parseFloat(resumen.ingresos_brutos) - parseFloat(resumen.cogs_total)
    : 0;

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  // No periods yet - show CTA
  if (periodos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <h1 className="text-xl font-bold text-stone-900 mb-5">Ventas</h1>
        <div className={`${cx.card} p-12 text-center`}>
          <ShoppingCart size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-sm mb-6">
            Para registrar ventas, primero necesitas crear un periodo contable.
          </p>
          <button
            onClick={crearPrimerPeriodo}
            disabled={creatingPeriodo}
            className={cx.btnPrimary}
          >
            {creatingPeriodo ? 'Creando...' : 'Crear primer periodo'}
          </button>
        </div>
      </div>
    );
  }

  // Helper to get venta display name
  const ventaDisplayName = (v) => {
    if (v.items?.length > 1) return `${v.items.length} productos`;
    return v.items?.[0]?.producto_nombre || v.producto_nombre || '-';
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header: title + period selector + register button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-stone-900">Ventas</h1>
          <PeriodoSelector
            periodos={periodos}
            value={periodo}
            onChange={setPeriodo}
            onCreatePeriodo={async (year, month) => {
              const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
              const inicio = `${year}-${String(month+1).padStart(2,'0')}-01`;
              const lastDay = new Date(year, month+1, 0).getDate();
              const fin = `${year}-${String(month+1).padStart(2,'0')}-${lastDay}`;
              try {
                const res = await api.post('/pl/periodos', { nombre: `${MESES_FULL[month]} ${year}`, fecha_inicio: inicio, fecha_fin: fin });
                const nuevo = res.data;
                setPeriodos(prev => [nuevo, ...prev]);
              } catch(e) { toast.error(e.message); }
            }}
          />
        </div>
        <button onClick={openNewVenta} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Registrar venta
        </button>
      </div>

      {/* Summary cards */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <SummaryCard
            icon={<DollarSign size={18} />}
            label="Ingresos"
            value={formatCurrency(resumen.ingresos_brutos)}
            accent
          />
          <SummaryCard
            icon={<Package size={18} />}
            label="COGS"
            value={formatCurrency(resumen.cogs_total)}
          />
          <SummaryCard
            icon={<TrendingUp size={18} />}
            label="Utilidad bruta"
            value={formatCurrency(utilidadBruta)}
            positive={utilidadBruta >= 0}
          />
          <SummaryCard
            icon={<ShoppingCart size={18} />}
            label="Unidades vendidas"
            value={parseInt(resumen.unidades_vendidas) || 0}
          />
        </div>
      )}

      {/* Ventas list */}
      {loadingVentas ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : ventas.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <p className="text-stone-400 text-sm">No hay ventas registradas en este periodo</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Fecha</th>
                  <th className={cx.th}>Producto</th>
                  <th className={cx.th + ' text-center'}>Cant.</th>
                  <th className={cx.th + ' text-right'}>Descuento</th>
                  <th className={cx.th + ' text-right'}>Total</th>
                  <th className={cx.th + ' w-20'}></th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className={cx.tr}>
                    <td className={cx.td + ' text-stone-600'}>{formatDate(v.fecha)}</td>
                    <td className={cx.td + ' font-medium text-stone-900'}>{ventaDisplayName(v)}</td>
                    <td className={cx.td + ' text-center text-stone-600'}>
                      {v.items?.length > 1
                        ? v.items.reduce((s, i) => s + (parseInt(i.cantidad) || 0), 0)
                        : v.cantidad}
                    </td>
                    <td className={cx.td + ' text-right text-stone-400'}>
                      {parseFloat(v.descuento) > 0 || parseFloat(v.descuento_global) > 0
                        ? `-${formatCurrency((parseFloat(v.descuento) || 0) + (parseFloat(v.descuento_global) || 0))}`
                        : '-'}
                    </td>
                    <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(v.total)}</td>
                    <td className={cx.td}>
                      <div className="flex items-center gap-1 justify-end">
                        {v.facturado && (
                          <span className={cx.badge('bg-emerald-50 text-emerald-600')}>Facturado</span>
                        )}
                        {!v.facturado && (
                          <button onClick={() => openEmitirModal(v)} className={cx.btnGhost + ' text-xs text-[var(--accent)]'}>
                            Emitir
                          </button>
                        )}
                        <button onClick={() => openEditVenta(v)} className={cx.btnIcon}><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(v)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: accordion cards */}
          <div className={`${cx.card} divide-y divide-stone-100 lg:hidden`}>
            {ventas.map((v) => {
              const isExpanded = collapsed[v.id] === true;
              return (
                <div key={v.id} className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded
                        ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                        : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{ventaDisplayName(v)}</p>
                        <p className="text-[11px] text-stone-400">{formatDate(v.fecha)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-stone-900 flex-shrink-0 ml-3">{formatCurrency(v.total)}</span>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      {/* Show each item if multi-product */}
                      {v.items && v.items.length > 0 ? (
                        <div className="space-y-1 mb-3">
                          {v.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-stone-700">{item.producto_nombre} x{item.cantidad}</span>
                              <span className="text-stone-600">{formatCurrency((parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1))}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                          <div>
                            <span className="text-stone-400">Precio unit.</span>
                            <p className="text-stone-800 font-medium">{formatCurrency(v.precio_unitario)}</p>
                          </div>
                          <div>
                            <span className="text-stone-400">Cantidad</span>
                            <p className="text-stone-800 font-medium">{v.cantidad}</p>
                          </div>
                        </div>
                      )}
                      {(parseFloat(v.descuento) > 0 || parseFloat(v.descuento_global) > 0) && (
                        <div className="text-xs mb-3">
                          <span className="text-stone-400">Descuento</span>
                          <p className="text-stone-800 font-medium">
                            {formatCurrency((parseFloat(v.descuento) || 0) + (parseFloat(v.descuento_global) || 0))}
                          </p>
                        </div>
                      )}
                      {v.nota && (
                        <div className="text-xs mb-3">
                          <span className="text-stone-400">Nota</span>
                          <p className="text-stone-600">{v.nota}</p>
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {v.facturado && (
                          <span className={cx.badge('bg-emerald-50 text-emerald-600')}>Facturado</span>
                        )}
                        {!v.facturado && (
                          <button onClick={() => openEmitirModal(v)} className={cx.btnGhost + ' text-xs text-[var(--accent)] flex items-center gap-1'}>
                            <FileText size={12} /> Emitir
                          </button>
                        )}
                        <button onClick={() => openEditVenta(v)} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                          <Pencil size={12} /> Editar
                        </button>
                        <button onClick={() => setDeleteTarget(v)} className={cx.btnDanger + ' text-xs flex items-center gap-1'}>
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Register/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-stone-900">
                  {editingVenta ? 'Editar venta' : 'Registrar venta'}
                </h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Products list */}
                <div className="space-y-2">
                  <label className={cx.label}>Productos</label>
                  {ventaItems.map((item, idx) => (
                    <div key={item._id} className="flex gap-2 items-center bg-stone-50 rounded-lg p-2">
                      <div className="flex-1">
                        <SearchableSelect
                          options={enrichedProductos}
                          value={item.producto_id}
                          onChange={(prod) => selectProducto(item._id, prod)}
                          placeholder="Producto..."
                        />
                      </div>
                      <input type="number" value={item.cantidad} min="1"
                        onChange={e => updateItem(item._id, 'cantidad', parseInt(e.target.value) || 1)}
                        className="w-16 bg-white rounded-lg px-2 py-2 text-sm text-center border border-stone-200"
                        placeholder="Cant" />
                      <input type="number" value={item.precio_unitario} step="0.01"
                        onChange={e => updateItem(item._id, 'precio_unitario', e.target.value)}
                        className="w-24 bg-white rounded-lg px-2 py-2 text-sm text-center border border-stone-200"
                        placeholder="Precio" />
                      <span className="text-sm font-medium text-stone-700 w-20 text-right">
                        {formatCurrency((parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1) - (parseFloat(item.descuento) || 0))}
                      </span>
                      {ventaItems.length > 1 && (
                        <button onClick={() => removeItem(item._id)} className={cx.btnIcon + ' hover:text-rose-600'}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addItem} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                    <Plus size={13} /> Agregar producto
                  </button>
                </div>

                {/* Subtotal + descuento global */}
                <div className="border-t border-stone-200 pt-3 mt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Subtotal</span>
                    <span className="text-stone-800 font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className={cx.label + ' mb-0'}>Descuento global</label>
                    <input type="number" step="0.01" value={descuentoGlobal}
                      onChange={e => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                      className="w-24 bg-white rounded-lg px-2 py-2 text-sm text-right border border-stone-200" />
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-[var(--accent)]">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className={cx.label}>Fecha</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className={cx.input}
                  />
                </div>

                {/* Contra entrega toggle */}
                {!editingVenta && (
                <>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={contraEntrega} onChange={e => setContraEntrega(e.target.checked)}
                      className="accent-[var(--accent)] w-4 h-4" />
                    <span className="text-sm text-stone-700">Contra entrega</span>
                  </label>
                </div>

                {contraEntrega && (
                  <div className="p-3 bg-amber-50 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cx.label}>Adelanto</label>
                        <input type="number" step="0.01" min="0" value={adelanto}
                          onChange={e => setAdelanto(e.target.value)} className={cx.input} placeholder="0.00" />
                      </div>
                      <div>
                        <label className={cx.label}>Restante</label>
                        <p className="text-lg font-bold text-amber-600 mt-1">
                          {formatCurrency(Math.max(0, subtotal - parseFloat(adelanto || 0)))}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className={cx.label}>Fecha de entrega</label>
                      <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} className={cx.input} />
                    </div>
                  </div>
                )}
                </>
                )}

                {/* Canal de venta */}
                {canales.length > 0 && (
                  <div>
                    <label className={cx.label}>Canal de venta (opcional)</label>
                    <CustomSelect
                      value={canalId}
                      onChange={setCanalId}
                      options={[{ value: '', label: 'Venta directa (sin canal)' }, ...canales.map(c => ({ value: c.id, label: c.nombre }))]}
                      placeholder="Venta directa"
                    />
                  </div>
                )}

                {/* Vendedor (only if there are vendors with comision_pct > 0) */}
                {vendedores.length > 0 && (
                  <div>
                    <label className={cx.label}>Vendedor (opcional)</label>
                    <CustomSelect
                      value={vendedorId}
                      onChange={setVendedorId}
                      options={[
                        { value: '', label: 'Sin vendedor' },
                        ...vendedores.map(v => ({ value: v.id, label: `${v.nombre} (${parseFloat(v.comision_pct)}%)` })),
                      ]}
                      placeholder="Seleccionar vendedor..."
                    />
                  </div>
                )}

                {/* Envio */}
                <>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tieneEnvio} onChange={e => setTieneEnvio(e.target.checked)}
                      className="accent-[var(--accent)] w-4 h-4" />
                    <span className="text-sm text-stone-700">Tiene envio</span>
                  </label>
                </div>

                {tieneEnvio && (
                  <div className="p-3 bg-sky-50 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cx.label}>Tipo de envio</label>
                        <CustomSelect
                          value={tipoEnvio}
                          onChange={setTipoEnvio}
                          options={[
                            { value: 'propio', label: 'Envio propio' },
                            { value: 'aplicacion', label: 'Por aplicacion' },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {zonas.length > 0 && (
                        <div>
                          <label className={cx.label}>Zona</label>
                          <CustomSelect
                            value={zonaEnvioId}
                            onChange={(v) => {
                              setZonaEnvioId(v);
                              const zona = zonas.find(z => z.id === parseInt(v));
                              if (zona) setCostoEnvio(zona.costo);
                            }}
                            options={[{ value: '', label: 'Sin zona' }, ...zonas.map(z => ({ value: z.id, label: `${z.nombre} (S/ ${z.costo})` }))]}
                            placeholder="Seleccionar zona..."
                          />
                        </div>
                      )}
                      <div>
                        <label className={cx.label}>Costo envio</label>
                        <input type="number" step="0.01" min="0" value={costoEnvio}
                          onChange={e => setCostoEnvio(e.target.value)} className={cx.input} placeholder="0.00" />
                      </div>
                    </div>
                    <div>
                      <label className={cx.label}>Direccion de entrega</label>
                      <input type="text" value={direccionEnvio} onChange={e => setDireccionEnvio(e.target.value)}
                        className={cx.input} placeholder="Direccion de entrega..." />
                    </div>
                  </div>
                )}
                </>

                {/* Cuenta */}
                {cuentas.length > 0 && (
                <div>
                  <label className={cx.label}>Cuenta de ingreso</label>
                  <CustomSelect
                    options={[{ value: '', label: 'Sin especificar' }, ...cuentas]}
                    value={form.cuenta_id}
                    onChange={(v) => setForm((f) => ({ ...f, cuenta_id: v }))}
                    placeholder="¿A qué cuenta entró?"
                  />
                </div>
                )}

                {/* Cliente (opcional) */}
                <div>
                  <label className={cx.label}>Cliente (opcional)</label>
                  <CustomSelect
                    options={[{ value: '', label: 'Sin cliente' }, ...ventaClientes]}
                    value={form.cliente_id || ''}
                    onChange={(v) => setForm(f => ({ ...f, cliente_id: v }))}
                    placeholder="Buscar por DNI/RUC/nombre..."
                  />
                  {!form.cliente_id && (
                    <button type="button" onClick={() => setShowNewClient(true)} className={cx.btnGhost + ' text-xs mt-1'}>
                      + Nuevo cliente
                    </button>
                  )}
                </div>

                {/* Quick new client form */}
                {showNewClient && (
                  <div className="p-3 bg-stone-50 rounded-lg space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={cx.label}>DNI/RUC</label>
                        <input type="text" value={newClient.num_doc || ''} onChange={e => setNewClient(p => ({...p, num_doc: e.target.value}))} className={cx.input} placeholder="12345678" />
                      </div>
                      <div>
                        <label className={cx.label}>Nombre/Razon social</label>
                        <input type="text" value={newClient.razon_social || ''} onChange={e => setNewClient(p => ({...p, razon_social: e.target.value}))} className={cx.input} placeholder="Juan Perez" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCreateClient} className={cx.btnPrimary + ' text-xs'}>Guardar cliente</button>
                      <button type="button" onClick={() => setShowNewClient(false)} className={cx.btnGhost + ' text-xs'}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Note */}
                <div>
                  <label className={cx.label}>Nota (opcional)</label>
                  <input
                    type="text"
                    value={form.nota}
                    onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Pedido delivery"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button onClick={saveVenta} className={cx.btnPrimary + ' flex-1'}>
                  {editingVenta ? 'Guardar cambios' : 'Registrar'}
                </button>
                <button onClick={() => setModalOpen(false)} className={cx.btnSecondary}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Emitir comprobante modal */}
      {emitirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEmitirModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-900">Emitir comprobante</h3>
              <button onClick={() => setEmitirModal(null)} className={cx.btnGhost}><X size={18} /></button>
            </div>

            <div className="space-y-4">
              {/* Venta info */}
              <div className="p-3 bg-stone-50 rounded-lg">
                {emitirModal.items && emitirModal.items.length > 0 ? (
                  <div className="space-y-1">
                    {emitirModal.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-stone-800">{item.producto_nombre} x{item.cantidad}</span>
                        <span className="text-stone-600">{formatCurrency((parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-medium pt-1 border-t border-stone-200">
                      <span>Total</span>
                      <span>{formatCurrency(emitirModal.total)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-stone-800">{emitirModal.producto_nombre}</p>
                    <p className="text-xs text-stone-500">Cant: {emitirModal.cantidad} x {formatCurrency(emitirModal.precio_unitario)} = {formatCurrency(emitirModal.total || (emitirModal.cantidad * emitirModal.precio_unitario))}</p>
                  </>
                )}
              </div>

              {/* Tipo */}
              <div>
                <label className={cx.label}>Tipo de comprobante</label>
                <CustomSelect
                  value={emitirTipo}
                  onChange={setEmitirTipo}
                  options={[
                    { value: 'boleta', label: 'Boleta de venta' },
                    { value: 'factura', label: 'Factura' },
                  ]}
                />
              </div>

              {/* Cliente */}
              <div>
                <label className={cx.label}>
                  Cliente {emitirTipo === 'factura' ? '(requerido - con RUC)' : '(opcional)'}
                </label>
                <CustomSelect
                  value={emitirClienteId}
                  onChange={setEmitirClienteId}
                  options={[{ value: '', label: 'Sin cliente / Varios' }, ...emitirClientes]}
                  placeholder="Seleccionar cliente..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleEmitir}
                  disabled={emitting || (emitirTipo === 'factura' && !emitirClienteId)}
                  className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-2'}
                >
                  {emitting ? 'Emitiendo...' : `Emitir ${emitirTipo === 'factura' ? 'factura' : 'boleta'}`}
                </button>
                <button onClick={() => setEmitirModal(null)} className={cx.btnSecondary}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar venta"
        message={`Estas seguro de eliminar esta venta de "${deleteTarget ? ventaDisplayName(deleteTarget) : ''}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// Summary card component
function SummaryCard({ icon, label, value, accent, positive }) {
  return (
    <div className={`${cx.card} p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={accent ? 'text-[var(--accent)]' : 'text-stone-400'}>{icon}</span>
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <p className={`text-xl font-bold ${
        positive === false ? 'text-rose-600' : positive === true ? 'text-teal-700' : 'text-stone-900'
      }`}>
        {value}
      </p>
    </div>
  );
}
