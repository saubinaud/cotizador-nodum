import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Pencil, Trash2, X, Save, Users, Search } from 'lucide-react';

const TIPO_DOC_OPTIONS = [
  { value: '1', label: 'DNI' },
  { value: '6', label: 'RUC' },
  { value: '0', label: 'Sin documento' },
];

const TIPO_DOC_LABELS = { '1': 'DNI', '6': 'RUC', '0': 'Sin doc' };

function tipoBadge(tipo) {
  switch (String(tipo)) {
    case '1': return cx.badge('bg-stone-100 text-stone-600');
    case '6': return cx.badge('bg-emerald-50 text-emerald-600');
    default: return cx.badge('bg-amber-50 text-amber-600');
  }
}

const emptyForm = {
  tipo_doc: '1',
  num_doc: '',
  razon_social: '',
  direccion: '',
  email: '',
  telefono: '',
};

export default function ClientesPage() {
  const api = useApi();
  const toast = useToast();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadClientes = async () => {
    try {
      const res = await api.get('/clientes');
      setClientes(res.data || res || []);
    } catch {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClientes(); }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!search.trim()) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(c =>
      (c.num_doc || '').toLowerCase().includes(q) ||
      (c.razon_social || '').toLowerCase().includes(q)
    );
  }, [clientes, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      tipo_doc: String(c.tipo_doc ?? '1'),
      num_doc: c.num_doc || '',
      razon_social: c.razon_social || '',
      direccion: c.direccion || '',
      email: c.email || '',
      telefono: c.telefono || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.razon_social.trim()) {
      toast.error('Razon social es requerida');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/clientes/${editing.id}`, form);
        toast.success('Cliente actualizado');
      } else {
        await api.post('/clientes', form);
        toast.success('Cliente creado');
      }
      setModalOpen(false);
      loadClientes();
    } catch (err) {
      toast.error(err.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/clientes/${deleteTarget.id}`);
      toast.success('Cliente eliminado');
      loadClientes();
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleteTarget(null);
    }
  };

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

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
        <div className="flex items-center gap-3">
          <Users size={22} className="text-[var(--accent)]" />
          <h1 className="text-xl font-bold text-stone-900">Clientes</h1>
        </div>
        <button onClick={openNew} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cx.input + ' pl-10'}
          placeholder="Buscar por documento o razon social..."
        />
      </div>

      {filtered.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <Users size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 text-sm">
            {search ? 'No se encontraron clientes' : 'No hay clientes registrados'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Tipo Doc</th>
                  <th className={cx.th}>Num Doc</th>
                  <th className={cx.th}>Razon Social</th>
                  <th className={cx.th}>Direccion</th>
                  <th className={cx.th}>Email</th>
                  <th className={cx.th}>Telefono</th>
                  <th className={cx.th + ' w-20'}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={cx.tr}>
                    <td className={cx.td}>
                      <span className={tipoBadge(c.tipo_doc)}>{TIPO_DOC_LABELS[String(c.tipo_doc)] || 'Otro'}</span>
                    </td>
                    <td className={cx.td + ' text-stone-600 font-mono text-xs'}>{c.num_doc || '-'}</td>
                    <td className={cx.td + ' font-medium text-stone-900'}>{c.razon_social || '-'}</td>
                    <td className={cx.td + ' text-stone-600 text-xs'}>{c.direccion || '-'}</td>
                    <td className={cx.td + ' text-stone-600 text-xs'}>{c.email || '-'}</td>
                    <td className={cx.td + ' text-stone-600 text-xs'}>{c.telefono || '-'}</td>
                    <td className={cx.td}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className={cx.btnIcon}><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(c)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((c) => (
              <div key={c.id} className={cx.card + ' p-4'}>
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{c.razon_social || '-'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={tipoBadge(c.tipo_doc)}>{TIPO_DOC_LABELS[String(c.tipo_doc)] || 'Otro'}</span>
                      <span className="text-xs text-stone-500 font-mono">{c.num_doc || '-'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(c)} className={cx.btnIcon}><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(c)} className={cx.btnIcon + ' hover:text-rose-600'}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                  {c.email && (
                    <div className="text-stone-500 truncate">{c.email}</div>
                  )}
                  {c.telefono && (
                    <div className="text-stone-500">{c.telefono}</div>
                  )}
                  {c.direccion && (
                    <div className="col-span-2 text-stone-400 truncate">{c.direccion}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-stone-900">
                  {editing ? 'Editar cliente' : 'Nuevo cliente'}
                </h3>
                <button onClick={() => setModalOpen(false)} className={cx.btnIcon}>
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={cx.label}>Tipo de documento</label>
                  <CustomSelect
                    value={form.tipo_doc}
                    onChange={(v) => updateForm('tipo_doc', v)}
                    options={TIPO_DOC_OPTIONS}
                  />
                </div>

                <div>
                  <label className={cx.label}>Numero de documento</label>
                  <input
                    type="text"
                    value={form.num_doc}
                    onChange={(e) => updateForm('num_doc', e.target.value)}
                    className={cx.input}
                    placeholder={form.tipo_doc === '6' ? '20XXXXXXXXX' : '4XXXXXXX'}
                    maxLength={form.tipo_doc === '6' ? 11 : 8}
                  />
                </div>

                <div>
                  <label className={cx.label}>Razon social / Nombre</label>
                  <input
                    type="text"
                    value={form.razon_social}
                    onChange={(e) => updateForm('razon_social', e.target.value)}
                    className={cx.input}
                    placeholder="Nombre del cliente"
                  />
                </div>

                <div>
                  <label className={cx.label}>Direccion</label>
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={(e) => updateForm('direccion', e.target.value)}
                    className={cx.input}
                    placeholder="Direccion fiscal"
                  />
                </div>

                <div>
                  <label className={cx.label}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateForm('email', e.target.value)}
                    className={cx.input}
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div>
                  <label className={cx.label}>Telefono</label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={(e) => updateForm('telefono', e.target.value)}
                    className={cx.input}
                    placeholder="999 999 999"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={handleSave} disabled={saving} className={cx.btnPrimary + ' flex-1 flex items-center justify-center gap-2'}>
                  <Save size={14} />
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cliente'}
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
        title="Eliminar cliente"
        message={`Estas seguro de eliminar a "${deleteTarget?.razon_social}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
