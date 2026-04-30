import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, X, Trash2, Pencil, Truck, MapPin,
} from 'lucide-react';

export default function CanalesPage() {
  const api = useApi();
  const toast = useToast();

  const [tab, setTab] = useState('canales');
  const [canales, setCanales] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Load data
  useEffect(() => {
    Promise.all([
      api.get('/canales').catch(() => ({ data: [] })),
      api.get('/canales/zonas').catch(() => ({ data: [] })),
    ]).then(([canalesRes, zonasRes]) => {
      setCanales(canalesRes.data || []);
      setZonas(zonasRes.data || []);
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setForm({});
    setEditingId(null);
    setShowForm(false);
  };

  // ─── Canales CRUD ───
  const openNewCanal = () => {
    setForm({ nombre: '', comision_pct: '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditCanal = (c) => {
    setForm({
      nombre: c.nombre,
      comision_pct: c.comision_pct ?? '',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const saveCanal = async () => {
    if (!form.nombre?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        comision_pct: parseFloat(form.comision_pct) || 0,
      };
      if (editingId) {
        await api.put(`/canales/${editingId}`, body);
        toast.success('Canal actualizado');
      } else {
        await api.post('/canales', body);
        toast.success('Canal creado');
      }
      const res = await api.get('/canales');
      setCanales(res.data || []);
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Error guardando canal');
    } finally {
      setSaving(false);
    }
  };

  const deleteCanal = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/canales/${deleteTarget.id}`);
      toast.success('Canal eliminado');
      setCanales(prev => prev.filter(c => c.id !== deleteTarget.id));
    } catch (err) {
      toast.error(err.message || 'Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // ─── Zonas CRUD ───
  const openNewZona = () => {
    setForm({ nombre: '', costo: '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditZona = (z) => {
    setForm({ nombre: z.nombre, costo: z.costo ?? '' });
    setEditingId(z.id);
    setShowForm(true);
  };

  const saveZona = async () => {
    if (!form.nombre?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        costo: parseFloat(form.costo) || 0,
      };
      if (editingId) {
        await api.put(`/canales/zonas/${editingId}`, body);
        toast.success('Zona actualizada');
      } else {
        await api.post('/canales/zonas', body);
        toast.success('Zona creada');
      }
      const res = await api.get('/canales/zonas');
      setZonas(res.data || []);
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Error guardando zona');
    } finally {
      setSaving(false);
    }
  };

  const deleteZona = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/canales/zonas/${deleteTarget.id}`);
      toast.success('Zona eliminada');
      setZonas(prev => prev.filter(z => z.id !== deleteTarget.id));
    } catch (err) {
      toast.error(err.message || 'Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  const tabs = [
    { value: 'canales', label: 'Canales' },
    { value: 'zonas', label: 'Zonas de envio' },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <h1 className="text-xl font-bold text-stone-900">Canales y Envio</h1>
        <button
          onClick={tab === 'canales' ? openNewCanal : openNewZona}
          className={cx.btnPrimary + ' flex items-center gap-2'}
        >
          <Plus size={14} /> {tab === 'canales' ? 'Nuevo canal' : 'Nueva zona'}
        </button>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5">
        {tabs.map(t => (
          <button
            key={t.value}
            onClick={() => { setTab(t.value); resetForm(); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              tab === t.value ? 'bg-[#0A2F24] text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Canales ─── */}
      {tab === 'canales' && (
        <>
          {/* Inline form */}
          {showForm && (
            <div className={`${cx.card} p-5 mb-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-900">
                  {editingId ? 'Editar canal' : 'Nuevo canal'}
                </h3>
                <button onClick={resetForm} className={cx.btnIcon}><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input type="text" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className={cx.input} placeholder="Rappi, PedidosYa..." />
                </div>
                <div>
                  <label className={cx.label}>Comision %</label>
                  <input type="number" step="0.1" min="0" value={form.comision_pct || ''} onChange={e => setForm(f => ({ ...f, comision_pct: e.target.value }))}
                    className={cx.input} placeholder="30" />
                  <p className="text-[10px] text-stone-400 mt-1">Ej: 30% = precio x 1.43</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveCanal} disabled={saving} className={cx.btnPrimary}>
                  {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear canal'}
                </button>
                <button onClick={resetForm} className={cx.btnSecondary}>Cancelar</button>
              </div>
            </div>
          )}

          {canales.length === 0 ? (
            <div className={`${cx.card} p-12 text-center`}>
              <Truck size={40} className="text-stone-300 mx-auto mb-4" />
              <p className="text-stone-400 text-sm">No hay canales registrados</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={`${cx.card} hidden lg:block overflow-hidden`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className={cx.th}>Nombre</th>
                      <th className={cx.th + ' text-center'}>Comision %</th>
                      <th className={cx.th + ' text-center'}>Precio ejemplo (S/ 20)</th>
                      <th className={cx.th + ' w-24'}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {canales.map(c => {
                      const com = parseFloat(c.comision_pct) || 0;
                      const ejemplo = com < 100 ? (20 / (1 - com / 100)) : 20;
                      return (
                        <tr key={c.id} className={cx.tr}>
                          <td className={cx.td + ' font-medium text-stone-900'}>{c.nombre}</td>
                          <td className={cx.td + ' text-center'}>
                            <span className={cx.badge('bg-amber-50 text-amber-600')}>
                              {com}%
                            </span>
                          </td>
                          <td className={cx.td + ' text-center'}>
                            <span className={cx.badge('bg-sky-50 text-sky-600')}>
                              {formatCurrency(Math.round(ejemplo * 100) / 100)}
                            </span>
                          </td>
                          <td className={cx.td}>
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEditCanal(c)} className={cx.btnIcon}><Pencil size={14} /></button>
                              <button onClick={() => setDeleteTarget({ ...c, _type: 'canal' })} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3">
                {canales.map(c => {
                  const com = parseFloat(c.comision_pct) || 0;
                  const ejemplo = com < 100 ? (20 / (1 - com / 100)) : 20;
                  return (
                    <div key={c.id} className={`${cx.card} p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-stone-900">{c.nombre}</p>
                        <div className="flex gap-1">
                          <button onClick={() => openEditCanal(c)} className={cx.btnIcon}><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget({ ...c, _type: 'canal' })} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className={cx.badge('bg-amber-50 text-amber-600')}>
                          {com}%
                        </span>
                        <span className={cx.badge('bg-sky-50 text-sky-600')}>
                          Ej: {formatCurrency(Math.round(ejemplo * 100) / 100)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Tab: Zonas ─── */}
      {tab === 'zonas' && (
        <>
          {/* Inline form */}
          {showForm && (
            <div className={`${cx.card} p-5 mb-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-900">
                  {editingId ? 'Editar zona' : 'Nueva zona'}
                </h3>
                <button onClick={resetForm} className={cx.btnIcon}><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input type="text" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className={cx.input} placeholder="Centro, Norte, Sur..." />
                </div>
                <div>
                  <label className={cx.label}>Costo (S/)</label>
                  <input type="number" step="0.01" min="0" value={form.costo || ''} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))}
                    className={cx.input} placeholder="5.00" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveZona} disabled={saving} className={cx.btnPrimary}>
                  {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear zona'}
                </button>
                <button onClick={resetForm} className={cx.btnSecondary}>Cancelar</button>
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
