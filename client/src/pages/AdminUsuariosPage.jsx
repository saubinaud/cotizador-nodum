import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatDate } from '../utils/format';
import { Plus, UserPlus, Ban, CheckCircle, Copy, X } from 'lucide-react';

export default function AdminUsuariosPage() {
  const api = useApi();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', temp_password: '' });
  const [onboardingLink, setOnboardingLink] = useState('');

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
    if (!createForm.email) {
      toast.error('Email requerido');
      return;
    }
    setCreating(true);
    try {
      const data = await api.post('/admin/usuarios', createForm);
      toast.success('Usuario creado');
      const d = data.data || data;
      if (d.onboarding_token) {
        const link = `${window.location.origin}/#/onboarding?token=${d.onboarding_token}`;
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

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Usuarios</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{users.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setShowCreate(true); setOnboardingLink(''); }} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div className={`${cx.card} p-5 mb-6 border-[#FA7B21]`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">Crear usuario</h3>
            <button onClick={() => { setShowCreate(false); setOnboardingLink(''); }} className={cx.btnIcon}><X size={16} /></button>
          </div>

          {onboardingLink ? (
            <div className="space-y-3">
              <p className="text-zinc-400 text-sm">Enlace de onboarding generado:</p>
              <div className="flex gap-2">
                <input type="text" value={onboardingLink} readOnly className={cx.input + ' text-xs'} />
                <button onClick={copyLink} className={cx.btnSecondary + ' flex items-center gap-1'}>
                  <Copy size={14} /> Copiar
                </button>
              </div>
              <button onClick={() => { setShowCreate(false); setOnboardingLink(''); setCreateForm({ email: '', temp_password: '' }); }} className={cx.btnGhost}>
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className={cx.label}>Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className={cx.input}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className={cx.label}>Contrasena temporal (opcional)</label>
                <input
                  type="text"
                  value={createForm.temp_password}
                  onChange={(e) => setCreateForm({ ...createForm, temp_password: e.target.value })}
                  className={cx.input}
                  placeholder="Se genera automaticamente si se deja vacio"
                />
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
                <h3 className="text-white font-medium text-sm">{u.nombre || u.email}</h3>
                <p className="text-zinc-500 text-xs mt-0.5">{u.email}</p>
                <p className="text-zinc-600 text-xs mt-1">{u.nombre_comercial || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx.badge(u.estado === 'activo' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
                  {u.estado}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-3 border-t border-zinc-800 pt-3">
              <button
                onClick={() => toggleStatus(u)}
                className={`${u.estado === 'activo' ? cx.btnDanger : cx.btnGhost + ' text-green-400'} flex-1 flex items-center justify-center gap-1`}
              >
                {u.estado === 'activo' ? <><Ban size={13} /> Suspender</> : <><CheckCircle size={13} /> Reactivar</>}
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
              <th className={cx.th}>Nombre</th>
              <th className={cx.th}>Email</th>
              <th className={cx.th}>Negocio</th>
              <th className={cx.th}>Registro</th>
              <th className={cx.th}>Estado</th>
              <th className={cx.th + ' text-right'}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={cx.tr}>
                <td className={cx.td + ' text-white font-medium'}>{u.nombre || '-'}</td>
                <td className={cx.td + ' text-zinc-300'}>{u.email}</td>
                <td className={cx.td + ' text-zinc-400'}>{u.nombre_comercial || '-'}</td>
                <td className={cx.td + ' text-zinc-500'}>{formatDate(u.created_at)}</td>
                <td className={cx.td}>
                  <span className={cx.badge(u.estado === 'activo' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
                    {u.estado}
                  </span>
                </td>
                <td className={cx.td + ' text-right'}>
                  <button
                    onClick={() => toggleStatus(u)}
                    className={u.estado === 'activo' ? cx.btnDanger : cx.btnGhost + ' text-green-400'}
                  >
                    {u.estado === 'activo' ? 'Suspender' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
