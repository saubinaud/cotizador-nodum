import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatDate } from '../utils/format';
import { Plus, UserPlus, Ban, CheckCircle, Copy, X, Settings, Trash2 } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomSelect from '../components/CustomSelect';

const ALL_MODULES = [
  // Catalogo
  { key: 'dashboard', label: 'Productos', group: 'Catalogo' },
  { key: 'cotizador', label: 'Nuevo producto', group: 'Catalogo', requires: ['insumos', 'materiales'] },
  { key: 'insumos', label: 'Ingredientes', group: 'Catalogo' },
  { key: 'materiales', label: 'Materiales', group: 'Catalogo' },
  { key: 'preparaciones', label: 'Recetas base', group: 'Catalogo' },
  { key: 'empaques', label: 'Empaques predet.', group: 'Catalogo' },
  { key: 'canales', label: 'Canales y Envio', group: 'Catalogo' },
  // Ventas
  { key: 'ventas', label: 'Ventas', group: 'Ventas', requires: ['dashboard'] },
  // Finanzas
  { key: 'finanzas', label: 'Finanzas', group: 'Finanzas' },
  // Facturacion
  { key: 'facturacion', label: 'Facturacion', group: 'Facturacion', requires: ['ventas'] },
];

const DEFAULT_PERMISOS = ALL_MODULES.map((m) => m.key);

export default function AdminUsuariosPage() {
  const api = useApi();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', nombre: '', rol: 'cliente', empresa: '', permisos: [...DEFAULT_PERMISOS], plan: 'trial', trial_days: '10' });
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

  // 3-state permission cycle: full → vitrina → hidden → full
  // When activating a module, also activate its dependencies
  const cyclePermiso = (permisos, key) => {
    const hasKey = permisos.includes(key);
    const hasVitrina = permisos.includes(`~${key}`);
    let result;
    if (hasKey) {
      result = [...permisos.filter(p => p !== key), `~${key}`];
    } else if (hasVitrina) {
      result = permisos.filter(p => p !== `~${key}`);
    } else {
      // Activating → also activate required dependencies
      result = [...permisos, key];
      const mod = ALL_MODULES.find(m => m.key === key);
      if (mod?.requires) {
        for (const dep of mod.requires) {
          if (!result.includes(dep)) result.push(dep);
        }
      }
    }
    return result;
  };

  const getPermisoState = (permisos, key) => {
    if (permisos.includes(key)) return 'full';
    if (permisos.includes(`~${key}`)) return 'vitrina';
    return 'hidden';
  };

  const PERM_LABELS = { full: 'Completo', vitrina: 'Vitrina', hidden: 'Oculto' };
  const PERM_COLORS = { full: 'bg-emerald-100 text-emerald-700', vitrina: 'bg-amber-100 text-amber-700', hidden: 'bg-stone-100 text-stone-400' };

  const toggleCreatePermiso = (key) => {
    setCreateForm((prev) => ({
      ...prev,
      permisos: cyclePermiso(prev.permisos, key),
    }));
  };

  const startEditPermisos = (u) => {
    setEditPermisos({ userId: u.id, permisos: Array.isArray(u.permisos) ? [...u.permisos] : [...DEFAULT_PERMISOS] });
  };

  const toggleEditPermiso = (key) => {
    setEditPermisos((prev) => ({
      ...prev,
      permisos: cyclePermiso(prev.permisos, key),
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

  const handleTogglePlan = async (u) => {
    const newPlan = u.plan === 'pro' ? 'trial' : 'pro';
    try {
      await api.patch(`/admin/usuarios/${u.id}/plan`, {
        plan: newPlan,
        trial_ends_at: newPlan === 'trial' ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() : null,
      });
      toast.success(`Plan cambiado a ${newPlan === 'pro' ? 'Pro' : 'Trial'}`);
      loadUsers();
    } catch {
      toast.error('Error cambiando plan');
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className={cx.skeleton + ' h-16'} />)}</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Usuarios</h2>
          <p className="text-stone-500 text-sm mt-0.5">{users.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setShowCreate(true); setOnboardingLink(''); }} className={cx.btnPrimary + ' flex items-center gap-2'}>
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div className={`${cx.card} p-6 mb-6 border-[var(--accent)]`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-stone-900">Crear usuario</h3>
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
              <button onClick={() => { setShowCreate(false); setOnboardingLink(''); setCreateForm({ email: '', nombre: '', rol: 'cliente', empresa: '', permisos: [...DEFAULT_PERMISOS], plan: 'trial', trial_days: '10' }); }} className={cx.btnGhost}>
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
                <div>
                  <label className={cx.label}>Plan</label>
                  <CustomSelect
                    value={createForm.plan}
                    onChange={(v) => setCreateForm({ ...createForm, plan: v })}
                    options={[
                      { value: 'trial', label: 'Prueba gratis' },
                      { value: 'pro', label: 'Pro (pagado)' },
                    ]}
                  />
                </div>
                {createForm.plan === 'trial' && (
                  <div>
                    <label className={cx.label}>Dias de prueba</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={createForm.trial_days}
                      onChange={(e) => setCreateForm({ ...createForm, trial_days: e.target.value })}
                      className={cx.input + ' max-w-[8rem]'}
                      placeholder="14"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className={cx.label}>Modulos (click para cambiar: Completo → Vitrina → Oculto)</label>
                <div className="space-y-3 mt-2">
                  {['Catalogo', 'Ventas', 'Finanzas', 'Facturacion'].map(group => {
                    const mods = ALL_MODULES.filter(m => m.group === group);
                    return (
                      <div key={group}>
                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold mb-1">{group}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {mods.map((m) => {
                            const state = getPermisoState(createForm.permisos, m.key);
                            return (
                              <button key={m.key} type="button" onClick={() => toggleCreatePermiso(m.key)}
                                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${PERM_COLORS[state]} border-transparent hover:border-stone-300`}
                              >
                                <span>{m.label}{m.requires ? ' *' : ''}</span>
                                <span className="text-[10px] font-bold uppercase">{PERM_LABELS[state]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-stone-400">* Activa automaticamente sus dependencias</p>
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
          <div key={u.id} className={`${cx.card} p-5`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-stone-800 font-medium text-sm">{u.nombre || u.email}</h3>
                <p className="text-stone-500 text-xs mt-0.5">{u.email}</p>
                <p className="text-stone-500 text-xs mt-1">{u.empresa || u.nombre_comercial || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.rol === 'admin' && <span className={cx.badge('bg-violet-50 text-violet-600')}>admin</span>}
                <span className={cx.badge(u.estado === 'activo' ? 'bg-[var(--accent-light)] text-[var(--success)]' : 'bg-rose-50 text-rose-600')}>
                  {u.estado}
                </span>
                <span className={cx.badge(u.plan === 'pro' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                  {u.plan === 'pro' ? 'Pro' : 'Trial'}
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
              <button
                onClick={() => handleTogglePlan(u)}
                className={cx.btnGhost + ' text-xs'}
                title={u.plan === 'pro' ? 'Cambiar a Trial' : 'Activar Pro'}
              >
                {u.plan === 'pro' ? 'Trial' : 'Pro'}
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
              <th className={cx.th}>Plan</th>
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
                <td className={cx.td}>
                  <span className={cx.badge(u.plan === 'pro' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {u.plan === 'pro' ? 'Pro' : 'Trial'}
                  </span>
                  {u.plan === 'trial' && u.trial_ends_at && (
                    <span className="text-[10px] text-stone-400 block mt-0.5">
                      {new Date(u.trial_ends_at) > new Date()
                        ? `${Math.ceil((new Date(u.trial_ends_at) - new Date()) / 86400000)}d`
                        : 'Vencido'}
                    </span>
                  )}
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
                    <button
                      onClick={() => handleTogglePlan(u)}
                      className={cx.btnGhost + ' text-xs'}
                      title={u.plan === 'pro' ? 'Cambiar a Trial' : 'Activar Pro'}
                    >
                      {u.plan === 'pro' ? 'Trial' : 'Pro'}
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
            <h3 className="text-stone-800 font-semibold mb-2">Modulos</h3>
            <p className="text-xs text-stone-400 mb-4">Click para cambiar estado</p>
            <div className="space-y-3">
              {['Catalogo', 'Ventas', 'Finanzas', 'Facturacion'].map(group => {
                const mods = ALL_MODULES.filter(m => m.group === group);
                return (
                  <div key={group}>
                    <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold mb-1">{group}</p>
                    {mods.map((m) => {
                      const state = getPermisoState(editPermisos.permisos, m.key);
                      return (
                        <button key={m.key} type="button" onClick={() => toggleEditPermiso(m.key)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${PERM_COLORS[state]} hover:opacity-80 mb-1`}
                        >
                          <span>{m.label}</span>
                          <span className="text-[10px] font-bold uppercase">{PERM_LABELS[state]}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
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
