import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatDate } from '../utils/format';
import { Plus, UserPlus, Ban, CheckCircle, Copy, X, Settings, Trash2 } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

const ALL_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cotizador', label: 'Cotizador' },
  { key: 'insumos', label: 'Insumos' },
  { key: 'materiales', label: 'Materiales' },
  { key: 'preparaciones', label: 'Prep. Predeterminadas' },
  { key: 'empaques', label: 'Empaques Predeterminados' },
  { key: 'proyeccion', label: 'Proyección de Ventas' },
];

const DEFAULT_PERMISOS = ALL_MODULES.map((m) => m.key);

export default function AdminUsuariosPage() {
  const api = useApi();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', nombre: '', rol: 'cliente', empresa: '', permisos: [...DEFAULT_PERMISOS] });
  const [onboardingLink, setOnboardingLink] = useState('');
  const [editPermisos, setEditPermisos] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.get('/admin/usuarios');
      setUsers(data.data || []);
    } catch {
      toast.error('Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.email || !createForm.nombre) {
      toast.error('Email y nombre son requeridos');
      return;
    }
    setCreating(true);
    try {
      const data = await api.post('/admin/usuarios', createForm);
      toast.success('Usuario creado');
      const d = data.data || data;
      if (d.onboarding_token) {
        const base = window.location.href.split('#')[0];
        const link = `${base}#/onboarding?token=${d.onboarding_token}`;
        setOnboardingLink(link);
      }
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (user) => {
    const newEstado = user.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await api.patch(`/admin/usuarios/${user.id}/estado`, { estado: newEstado });
      toast.success(`Usuario ${newEstado === 'activo' ? 'reactivado' : 'suspendido'}`);
      loadUsers();
    } catch {
      toast.error('Error cambiando estado');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(onboardingLink);
    toast.success('Link copiado al portapapeles');
  };

  const toggleCreatePermiso = (key) => {
    setCreateForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(key) ? prev.permisos.filter((p) => p !== key) : [...prev.permisos, key],
    }));
  };

  const startEditPermisos = (u) => {
    setEditPermisos({ userId: u.id, permisos: Array.isArray(u.permisos) ? [...u.permisos] : [...DEFAULT_PERMISOS] });
  };

  const toggleEditPermiso = (key) => {
    setEditPermisos((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(key) ? prev.permisos.filter((p) => p !== key) : [...prev.permisos, key],
    }));
  };

  const savePermisos = async () => {
    if (!editPermisos) return;
    try {
      await api.patch(`/admin/usuarios/${editPermisos.userId}/permisos`, { permisos: editPermisos.permisos });
      toast.success('Permisos actualizados');
      setEditPermisos(null);
      loadUsers();
    } catch {
      toast.error('Error actualizando permisos');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/admin/usuarios/${deleteTarget.id}`);
      toast.success('Usuario eliminado');
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    } catch (err) {
      toast.error(err.message || 'Error eliminando usuario');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-stone-800">Usuarios</h2>
          <p className="text-stone-400 text-sm mt-0.5">{users.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setShowCreate(true); setOnboardingLink(''); }} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div className={`${cx.card} p-5 mb-6 border-[var(--accent)]`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-stone-800 font-semibold">Crear usuario</h3>
            <button onClick={() => { setShowCreate(false); setOnboardingLink(''); }} className={cx.btnIcon}><X size={16} /></button>
          </div>

          {onboardingLink ? (
            <div className="space-y-3">
              <p className="text-stone-500 text-sm">Enlace de onboarding generado:</p>
              <div className="flex gap-2">
                <input type="text" value={onboardingLink} readOnly className={cx.input + ' text-xs'} />
                <button onClick={copyLink} className={cx.btnSecondary + ' flex items-center gap-1'}>
                  <Copy size={14} /> Copiar
                </button>
              </div>
              <button onClick={() => { setShowCreate(false); setOnboardingLink(''); setCreateForm({ email: '', nombre: '', rol: 'cliente', empresa: '' }); }} className={cx.btnGhost}>
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input
                    type="text"
                    value={createForm.nombre}
                    onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })}
                    className={cx.input}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className={cx.label}>Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className={cx.input}
                    required
                  />
                </div>
                <div>
                  <label className={cx.label}>Nombre comercial (opcional)</label>
                  <input
                    type="text"
                    value={createForm.empresa}
                    onChange={(e) => setCreateForm({ ...createForm, empresa: e.target.value })}
                    className={cx.input}
                    placeholder="Nombre del negocio"
                  />
                </div>
                <div>
                  <label className={cx.label}>Rol</label>
                  <select
                    value={createForm.rol}
                    onChange={(e) => setCreateForm({ ...createForm, rol: e.target.value })}
                    className={cx.select}
                  >
                    <option value="cliente">Cliente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={cx.label}>Modulos con acceso</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {ALL_MODULES.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer hover:text-stone-800">
                      <input
                        type="checkbox"
                        checked={createForm.permisos.includes(m.key)}
                        onChange={() => toggleCreatePermiso(m.key)}
                        className="accent-[var(--accent)] w-4 h-4"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className={cx.btnPrimary + ' flex items-center gap-2'}>
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus size={14} /> Crear</>}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className={cx.btnSecondary}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Users list */}
      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {users.map((u) => (
          <div key={u.id} className={`${cx.card} p-4`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-stone-800 font-medium text-sm">{u.nombre || u.email}</h3>
                <p className="text-stone-400 text-xs mt-0.5">{u.email}</p>
                <p className="text-stone-400 text-xs mt-1">{u.empresa || u.nombre_comercial || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.rol === 'admin' && <span className={cx.badge('bg-violet-50 text-violet-600')}>admin</span>}
                <span className={cx.badge(u.estado === 'activo' ? 'bg-[var(--accent-light)] text-[var(--success)]' : 'bg-rose-50 text-rose-600')}>
                  {u.estado}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(Array.isArray(u.permisos) ? u.permisos : DEFAULT_PERMISOS).map((p) => (
                <span key={p} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">{p}</span>
              ))}
            </div>
            {u.estado === 'pendiente' && u.onboarding_token && (
              <div className="mt-2 flex gap-2 items-center">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.href.split('#')[0]}#/onboarding?token=${u.onboarding_token}`}
                  className={cx.input + ' text-[10px] flex-1'}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.href.split('#')[0]}#/onboarding?token=${u.onboarding_token}`); toast.success('Link copiado'); }}
                  className={cx.btnSecondary + ' text-xs flex items-center gap-1'}
                >
                  <Copy size={12} /> Copiar
                </button>
              </div>
            )}
            <div className="flex gap-2 mt-3 border-t border-stone-200 pt-3">
              <button
                onClick={() => startEditPermisos(u)}
                className={cx.btnGhost + ' flex-1 flex items-center justify-center gap-1'}
              >
                <Settings size={13} /> Permisos
              </button>
              <button
                onClick={() => toggleStatus(u)}
                className={`${u.estado === 'activo' ? cx.btnDanger : cx.btnGhost + ' text-[var(--success)]'} flex-1 flex items-center justify-center gap-1`}
              >
                {u.estado === 'activo' ? <><Ban size={13} /> Suspender</> : <><CheckCircle size={13} /> Reactivar</>}
              </button>
              <button onClick={() => setDeleteTarget(u)} className={cx.btnDanger + ' flex items-center justify-center gap-1'}>
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
            <tr className="border-b border-stone-200">
              <th className={cx.th}>Nombre</th>
              <th className={cx.th}>Email</th>
              <th className={cx.th}>Negocio</th>
              <th className={cx.th}>Rol</th>
              <th className={cx.th}>Registro</th>
              <th className={cx.th}>Estado</th>
              <th className={cx.th + ' text-right'}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={cx.tr}>
                <td className={cx.td + ' text-stone-800 font-medium'}>{u.nombre || '-'}</td>
                <td className={cx.td + ' text-stone-600'}>{u.email}</td>
                <td className={cx.td + ' text-stone-500'}>{u.empresa || u.nombre_comercial || '-'}</td>
                <td className={cx.td}>
                  <span className={cx.badge(u.rol === 'admin' ? 'bg-violet-50 text-violet-600' : 'bg-stone-100 text-stone-600')}>
                    {u.rol}
                  </span>
                </td>
                <td className={cx.td + ' text-stone-400'}>{formatDate(u.created_at)}</td>
                <td className={cx.td}>
                  <div className="flex items-center gap-2">
                    <span className={cx.badge(u.estado === 'activo' ? 'bg-[var(--accent-light)] text-[var(--success)]' : u.estado === 'pendiente' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600')}>
                      {u.estado}
                    </span>
                    {u.estado === 'pendiente' && u.onboarding_token && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${window.location.href.split('#')[0]}#/onboarding?token=${u.onboarding_token}`); toast.success('Link copiado'); }}
                        className={cx.btnIcon + ' text-amber-600'} title="Copiar link onboarding"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </td>
                <td className={cx.td + ' text-right'}>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => startEditPermisos(u)} className={cx.btnIcon} title="Permisos">
                      <Settings size={15} />
                    </button>
                    <button
                      onClick={() => toggleStatus(u)}
                      className={u.estado === 'activo' ? cx.btnDanger : cx.btnGhost + ' text-[var(--success)]'}
                    >
                      {u.estado === 'activo' ? 'Suspender' : 'Reactivar'}
                    </button>
                    <button onClick={() => setDeleteTarget(u)} className={cx.btnIcon + ' hover:text-rose-600'} title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permisos modal */}
      {editPermisos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditPermisos(null)} />
          <div className={`${cx.card} relative p-6 w-full max-w-sm mx-4`}>
            <h3 className="text-stone-800 font-semibold mb-4">Modulos con acceso</h3>
            <div className="space-y-3">
              {ALL_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-3 text-sm text-stone-600 cursor-pointer hover:text-stone-800">
                  <input
                    type="checkbox"
                    checked={editPermisos.permisos.includes(m.key)}
                    onChange={() => toggleEditPermiso(m.key)}
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={savePermisos} className={cx.btnPrimary + ' flex-1'}>Guardar</button>
              <button onClick={() => setEditPermisos(null)} className={cx.btnSecondary + ' flex-1'}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar usuario"
        message={`Estas seguro de eliminar "${deleteTarget?.nombre || deleteTarget?.email}"? Se eliminaran todos sus datos.`}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
