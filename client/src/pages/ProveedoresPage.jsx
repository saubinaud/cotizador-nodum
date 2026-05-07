import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Pencil, Trash2, X, Truck, Search } from 'lucide-react';

const emptyForm = {
  nombre: '',
  ruc: '',
  contacto: '',
  email: '',
  telefono: '',
  direccion: '',
  notas: '',
};

export default function ProveedoresPage() {
  const api = useApi();
  const toast = useToast();

  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadProveedores = async () => {
    try {
      const res = await api.get('/proveedores');
      setProveedores(res.data || []);
    } catch {
      toast.error('Error cargando proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProveedores(); }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!search.trim()) return proveedores;
    const q = search.toLowerCase();
    return proveedores.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.ruc || '').toLowerCase().includes(q) ||
      (p.contacto || '').toLowerCase().includes(q)
    );
  }, [proveedores, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      nombre: p.nombre || '',
      ruc: p.ruc || '',
      contacto: p.contacto || '',
      email: p.email || '',
      telefono: p.telefono || '',
      direccion: p.direccion || '',
      notas: p.notas || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/proveedores/${editing.id}`, form);
        toast.success('Proveedor actualizado');
      } else {
        await api.post('/proveedores', form);
        toast.success('Proveedor creado');
      }
      setModalOpen(false);
      loadProveedores();
    } catch (err) {
      toast.error(err.message || 'Error guardando proveedor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/proveedores/${deleteTarget.id}`);
      toast.success('Proveedor eliminado');
      loadProveedores();
    } catch {
      toast.error('Error eliminando proveedor');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <h1 className="text-xl font-bold text-stone-900">Proveedores</h1>
        <button onClick={openNew} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nuevo proveedor
        </button>
      </div>

      {/* Search */}
      {proveedores.length > 0 && (
        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cx.input + ' pl-9'}
            placeholder="Buscar por nombre, RUC o contacto..."
          />
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Truck size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 text-sm">
            {proveedores.length === 0 ? 'No hay proveedores registrados' : 'No se encontraron resultados'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${cx.card} overflow-hidden hidden sm:block`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Nombre</th>
                  <th className={cx.th}>RUC</th>
                  <th className={cx.th}>Contacto</th>
                  <th className={cx.th}>Telefono</th>
                  <th className={cx.th + ' text-right'}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={cx.td + ' font-medium text-stone-900'}>{p.nombre}</td>
                    <td className={cx.td + ' text-stone-500'}>{p.ruc || '-'}</td>
                    <td className={cx.td + ' text-stone-500'}>{p.contacto || '-'}</td>
                    <td className={cx.td + ' text-stone-500'}>{p.telefono || '-'}</td>
                    <td className={cx.td + ' text-right'}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className={cx.btnIcon + ' !p-1'}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} className={cx.btnIcon + ' !p-1 hover:text-rose-600'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map((p) => (
              <div key={p.id} className={`${cx.card} p-4`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{p.nombre}</p>
                    {p.ruc && <p className="text-[11px] text-stone-400">RUC: {p.ruc}</p>}
                    {p.contacto && <p className="text-[11px] text-stone-500 mt-0.5">{p.contacto}</p>}
                    {p.telefono && <p className="text-[11px] text-stone-400">{p.telefono}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(p)} className={cx.btnIcon + ' !p-1'}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className={cx.btnIcon + ' !p-1 hover:text-rose-600'}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-stone-900">
                  {editing ? 'Editar proveedor' : 'Nuevo proveedor'}
                </h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={cx.label}>Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Distribuidora ABC"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cx.label}>RUC</label>
                    <input
                      type="text"
                      value={form.ruc}
                      onChange={(e) => setForm(f => ({ ...f, ruc: e.target.value }))}
                      className={cx.input}
                      placeholder="20123456789"
                    />
                  </div>
                  <div>
                    <label className={cx.label}>Telefono</label>
                    <input
                      type="text"
                      value={form.telefono}
                      onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                      className={cx.input}
                      placeholder="+51 999 999 999"
                    />
                  </div>
                </div>
                <div>
                  <label className={cx.label}>Contacto</label>
                  <input
                    type="text"
                    value={form.contacto}
                    onChange={(e) => setForm(f => ({ ...f, contacto: e.target.value }))}
                    className={cx.input}
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div>
                  <label className={cx.label}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className={cx.input}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div>
                  <label className={cx.label}>Direccion</label>
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))}
                    className={cx.input}
                    placeholder="Direccion del proveedor"
                  />
                </div>
                <div>
                  <label className={cx.label}>Notas</label>
                  <textarea
                    value={form.notas}
                    onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
                    className={cx.input + ' min-h-[60px]'}
                    placeholder="Notas adicionales..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={handleSave} disabled={saving} className={cx.btnPrimary + ' flex-1'}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear proveedor'}
                </button>
                <button onClick={() => setModalOpen(false)} className={cx.btnSecondary}>
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
        title="Eliminar proveedor"
        message={`Estas seguro de eliminar a "${deleteTarget?.nombre}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
