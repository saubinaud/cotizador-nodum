import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { User, Lock, Save } from 'lucide-react';

export default function PerfilPage() {
  const { user } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 6) {
      toast.error('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('Las contrasenas no coinciden');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/cambiar-password', {
        password_actual: pwForm.current_password,
        password_nueva: pwForm.new_password,
      });
      toast.success('Contrasena actualizada');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-white">Mi Perfil</h2>

      {/* Profile info */}
      <div className={`${cx.card} p-5`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FA7B21] to-[#FCA929] flex items-center justify-center">
            <User size={28} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">{user?.nombre || 'Usuario'}</h3>
            <p className="text-zinc-500 text-sm">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={cx.label}>DNI</label>
            <p className="text-white text-sm">{user?.dni || '-'}</p>
          </div>
          <div>
            <label className={cx.label}>RUC</label>
            <p className="text-white text-sm">{user?.ruc || '-'}</p>
          </div>
          <div>
            <label className={cx.label}>Nombre comercial</label>
            <p className="text-white text-sm">{user?.nombre_comercial || '-'}</p>
          </div>
          <div>
            <label className={cx.label}>Razon social</label>
            <p className="text-white text-sm">{user?.razon_social || '-'}</p>
          </div>
          <div>
            <label className={cx.label}>Tasa IGV</label>
            <p className="text-white text-sm">{user?.igv_rate || 18}%</p>
          </div>
          <div>
            <label className={cx.label}>Rol</label>
            <p className="text-white text-sm capitalize">{user?.rol || 'cliente'}</p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className={`${cx.card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-zinc-400" />
          <h3 className="text-white font-semibold">Cambiar contrasena</h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={cx.label}>Contrasena actual</label>
            <input
              type="password"
              value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              className={cx.input}
              required
            />
          </div>
          <div>
            <label className={cx.label}>Nueva contrasena</label>
            <input
              type="password"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              className={cx.input}
              required
              minLength={6}
            />
          </div>
          <div>
            <label className={cx.label}>Confirmar nueva contrasena</label>
            <input
              type="password"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              className={cx.input}
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className={cx.btnPrimary + ' flex items-center gap-2'}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save size={14} /> Actualizar contrasena
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
