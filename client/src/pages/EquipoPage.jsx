import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import CustomSelect from '../components/CustomSelect';
import { Users, UserPlus, Crown, ShieldCheck, Store, Eye, X, Copy, Trash2, ChefHat } from 'lucide-react';

const ROL_INFO = {
  owner: { label: 'Dueño', icon: Crown, color: 'bg-amber-50 text-amber-700', desc: 'Acceso total' },
  manager: { label: 'Gerente', icon: ShieldCheck, color: 'bg-sky-50 text-sky-700', desc: 'Ventas, finanzas, productos' },
  cashier: { label: 'Cajero', icon: Store, color: 'bg-emerald-50 text-emerald-700', desc: 'Ventas y pedidos' },
  kitchen: { label: 'Cocina', icon: ChefHat, color: 'bg-violet-50 text-violet-700', desc: 'Solo ve recetas' },
  viewer: { label: 'Visor', icon: Eye, color: 'bg-stone-100 text-stone-600', desc: 'Solo lectura' },
};

export default function EquipoPage() {
  const api = useApi();
  const toast = useToast();
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', nombre: '', rol_empresa: 'cashier' });
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await api.get('/equipo');
      setMembers(res.data || res || []);
    } catch { toast.error('Error cargando equipo'); }
    finally { setLoading(false); }
  }

  async function handleInvite() {
    if (!inviteForm.email || !inviteForm.nombre) { toast.error('Nombre y email requeridos'); return; }
    setSaving(true);
    try {
      const res = await api.post('/equipo/invitar', inviteForm);
      const d = res.data || res;
      if (d.onboarding_token) {
        const base = window.location.href.split('#')[0];
        setInviteLink(`${base}#/onboarding?token=${d.onboarding_token}`);
      }
      toast.success('Invitacion creada');
      loadMembers();
      setInviteForm({ email: '', nombre: '', rol_empresa: 'cashier' });
    } catch (err) { toast.error(err.message || 'Error invitando'); }
    finally { setSaving(false); }
  }

  async function handleChangeRol(memberId, newRol) {
    try {
      await api.patch(`/equipo/${memberId}/rol`, { rol_empresa: newRol });
      toast.success('Rol actualizado');
      loadMembers();
    } catch (err) { toast.error(err.message || 'Error'); }
  }

  async function handleRemove(memberId, nombre) {
    if (!window.confirm(`¿Remover a ${nombre} del equipo?`)) return;
    try {
      await api.del(`/equipo/${memberId}`);
      toast.success('Miembro removido');
      loadMembers();
    } catch (err) { toast.error(err.message || 'Error'); }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className={cx.skeleton + ' h-20'} />
        <div className={cx.skeleton + ' h-20'} />
        <div className={cx.skeleton + ' h-20'} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Mi Equipo</h1>
          <p className="text-sm text-stone-500 mt-0.5">{members.length} miembro{members.length !== 1 ? 's' : ''}</p>
        </div>
        {user?.rol_empresa === 'owner' && (
          <button onClick={() => { setShowInvite(true); setInviteLink(''); }} className={cx.btnPrimary + ' flex items-center gap-2'}>
            <UserPlus size={16} /> Invitar
          </button>
        )}
      </div>

      {/* Member cards */}
      <div className="space-y-3">
        {members.map(m => {
          const info = ROL_INFO[m.rol_empresa] || ROL_INFO.viewer;
          const isMe = m.id === user?.id;
          return (
            <div key={m.id} className={cx.card + ' p-4'}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0A2F24] text-white flex items-center justify-center text-sm font-bold">
                    {m.nombre?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-stone-900">{m.nombre}{isMe ? ' (tu)' : ''}</p>
                      <span className={cx.badge(info.color)}>{info.label}</span>
                      {m.estado === 'pendiente' && <span className={cx.badge('bg-amber-50 text-amber-600')}>Pendiente</span>}
                    </div>
                    <p className="text-xs text-stone-400">{m.email}</p>
                  </div>
                </div>

                {/* Actions (only owner can change roles, can't change self) */}
                {user?.rol_empresa === 'owner' && !isMe && (
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      compact
                      options={[
                        { value: 'manager', label: 'Gerente' },
                        { value: 'cashier', label: 'Cajero' },
                        { value: 'kitchen', label: 'Cocina' },
                        { value: 'viewer', label: 'Visor' },
                      ]}
                      value={m.rol_empresa}
                      onChange={(v) => handleChangeRol(m.id, v)}
                    />
                    <button onClick={() => handleRemove(m.id, m.nombre)} className={cx.btnDanger + ' p-2'} title="Remover">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Pending invite: show onboarding link */}
              {m.estado === 'pendiente' && m.onboarding_token && (
                <div className="mt-3 flex items-center gap-2">
                  <input type="text" readOnly
                    value={`${window.location.href.split('#')[0]}#/onboarding?token=${m.onboarding_token}`}
                    className={cx.input + ' text-[10px] flex-1'} />
                  <button onClick={() => {
                    navigator.clipboard.writeText(`${window.location.href.split('#')[0]}#/onboarding?token=${m.onboarding_token}`);
                    toast.success('Link copiado');
                  }} className={cx.btnSecondary + ' flex items-center gap-1 text-xs'}>
                    <Copy size={12} /> Copiar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-900">Invitar miembro</h3>
              <button onClick={() => setShowInvite(false)} className={cx.btnGhost}><X size={18} /></button>
            </div>

            {inviteLink ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">Invitacion creada. Comparte este link:</p>
                <div className="flex gap-2">
                  <input type="text" readOnly value={inviteLink} className={cx.input + ' text-xs'} />
                  <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('Link copiado'); }}
                    className={cx.btnSecondary + ' flex items-center gap-1'}>
                    <Copy size={14} /> Copiar
                  </button>
                </div>
                <button onClick={() => { setShowInvite(false); setInviteLink(''); }} className={cx.btnGhost}>Cerrar</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input type="text" value={inviteForm.nombre} onChange={e => setInviteForm(p => ({...p, nombre: e.target.value}))}
                    className={cx.input} placeholder="Nombre del empleado" autoFocus />
                </div>
                <div>
                  <label className={cx.label}>Email</label>
                  <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({...p, email: e.target.value}))}
                    className={cx.input} placeholder="email@ejemplo.com" />
                </div>
                <div>
                  <label className={cx.label}>Rol</label>
                  <CustomSelect
                    value={inviteForm.rol_empresa}
                    onChange={v => setInviteForm(p => ({...p, rol_empresa: v}))}
                    options={[
                      { value: 'manager', label: 'Gerente — ventas, finanzas, productos' },
                      { value: 'cashier', label: 'Cajero — ventas y pedidos' },
                      { value: 'kitchen', label: 'Cocina — solo ve recetas' },
                      { value: 'viewer', label: 'Visor — solo lectura' },
                    ]}
                  />
                </div>
                <button onClick={handleInvite} disabled={saving} className={cx.btnPrimary + ' w-full'}>
                  {saving ? 'Invitando...' : 'Enviar invitacion'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
