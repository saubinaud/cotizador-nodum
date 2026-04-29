import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { User, Lock, Save, Pencil, X, Upload, Loader2, Settings } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import { PAISES, getPaisByCode } from '../config/paises';
import { API_BASE } from '../config/api';

export default function PerfilPage() {
  const { user, setUser } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [editingAjustes, setEditingAjustes] = useState(false);
  const [ajustesForm, setAjustesForm] = useState({});
  const [savingAjustes, setSavingAjustes] = useState(false);

  const [giros, setGiros] = useState([]);
  useEffect(() => {
    api.get('/auth/giros').then(res => {
      const data = res.data || res;
      setGiros((data.giros || []).map(g => ({ value: g.id, label: g.nombre })));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = () => {
    setProfileForm({
      nombre: user?.nombre || '',
      nombre_comercial: user?.empresa || user?.nombre_comercial || '',
      ruc: user?.ruc || '',
      razon_social: user?.razon_social || '',
      igv_rate: user?.igv_rate ? (Number(user.igv_rate) < 1 ? Math.round(Number(user.igv_rate) * 100) : Number(user.igv_rate)) : 18,
      pais: user?.pais || 'PE',
      tipo_negocio: user?.tipo_negocio || 'formal',
      precio_decimales: user?.precio_decimales || 'variable',
      giro_negocio_id: user?.giro_negocio_id || '',
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setProfileForm({});
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = { ...profileForm };
      const data = await api.put('/auth/perfil', payload);
      const updatedUser = data.data?.user || data.data;
      setUser(updatedUser);
      localStorage.setItem('nodum_user', JSON.stringify(updatedUser));
      localStorage.setItem('nodum_moneda_simbolo', updatedUser.simbolo || 'S/');
      toast.success('Perfil actualizado');
      if (profileForm.giro_negocio_id !== (user?.giro_negocio_id || '')) {
        window.location.reload();
        return;
      }
      setEditing(false);
    } catch (err) {
      toast.error(err.message || 'Error actualizando perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar 2MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const token = localStorage.getItem('nodum_token');
          const res = await fetch(`${API_BASE}/auth/logo`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ image: reader.result }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Error subiendo logo');
          const updatedUser = { ...user, logo_url: data.data.logo_url };
          setUser(updatedUser);
          localStorage.setItem('nodum_user', JSON.stringify(updatedUser));
          toast.success('Logo actualizado');
        } catch (err) {
          toast.error(err.message || 'Error subiendo logo');
        } finally {
          setUploadingLogo(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('Error procesando imagen');
      setUploadingLogo(false);
    }
  };

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

  const startEditingAjustes = () => {
    setAjustesForm({
      tarifa_mo_global: user?.tarifa_mo_global || '',
      margen_minimo_global: user?.margen_minimo_global || 33,
    });
    setEditingAjustes(true);
  };

  const handleSaveAjustes = async () => {
    setSavingAjustes(true);
    try {
      const data = await api.put('/auth/ajustes', {
        tarifa_mo_global: ajustesForm.tarifa_mo_global !== '' ? Number(ajustesForm.tarifa_mo_global) : null,
        margen_minimo_global: Number(ajustesForm.margen_minimo_global) || 33,
      });
      const updated = { ...user, ...data.data };
      setUser(updated);
      localStorage.setItem('nodum_user', JSON.stringify(updated));
      toast.success('Ajustes actualizados');
      setEditingAjustes(false);
    } catch (err) {
      toast.error(err.message || 'Error guardando ajustes');
    } finally {
      setSavingAjustes(false);
    }
  };

  const igvDisplay = user?.igv_rate != null
    ? (Number(user.igv_rate) < 1 ? Math.round(Number(user.igv_rate) * 100) : Number(user.igv_rate))
    : 18;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-stone-900">Mi Perfil</h2>

      {/* Profile info */}
      <div className={`${cx.card} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              {user?.logo_url ? (
                <img src={user.logo_url} alt="Logo" className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center">
                  <User size={28} className="text-white" />
                </div>
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {uploadingLogo ? (
                  <Loader2 size={20} className="text-white animate-spin" />
                ) : (
                  <Upload size={20} className="text-white" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploadingLogo}
                />
              </label>
            </div>
            <div>
              <h3 className="text-stone-800 font-semibold text-lg">{user?.nombre || 'Usuario'}</h3>
              <p className="text-stone-500 text-sm">{user?.email}</p>
            </div>
          </div>
          {!editing && (
            <button onClick={startEditing} className={cx.btnGhost + ' flex items-center gap-1'}>
              <Pencil size={14} /> Editar
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className={cx.label}>Nombre</label>
              <input
                type="text"
                value={profileForm.nombre}
                onChange={(e) => setProfileForm({ ...profileForm, nombre: e.target.value })}
                className={cx.input}
              />
            </div>
            <div>
              <label className={cx.label}>Nombre comercial</label>
              <input
                type="text"
                value={profileForm.nombre_comercial}
                onChange={(e) => setProfileForm({ ...profileForm, nombre_comercial: e.target.value })}
                className={cx.input}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={cx.label}>RUC</label>
                <input
                  type="text"
                  value={profileForm.ruc}
                  onChange={(e) => setProfileForm({ ...profileForm, ruc: e.target.value })}
                  className={cx.input}
                />
              </div>
              <div>
                <label className={cx.label}>Razon social</label>
                <input
                  type="text"
                  value={profileForm.razon_social}
                  onChange={(e) => setProfileForm({ ...profileForm, razon_social: e.target.value })}
                  className={cx.input}
                />
              </div>
            </div>
            <div>
              <label className={cx.label}>Tipo de negocio</label>
              <CustomSelect
                value={profileForm.tipo_negocio}
                onChange={(val) => {
                  setProfileForm((prev) => ({
                    ...prev,
                    tipo_negocio: val,
                    ...(val === 'informal' ? { igv_rate: 0 } : {}),
                  }));
                }}
                options={[
                  { value: 'formal', label: 'Formal (paga IGV)' },
                  { value: 'informal', label: 'Informal (no paga IGV)' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {profileForm.tipo_negocio !== 'informal' && (
                <div>
                  <label className={cx.label}>Tasa IGV (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={profileForm.igv_rate}
                    onChange={(e) => setProfileForm({ ...profileForm, igv_rate: e.target.value })}
                    className={cx.input + ' w-32'}
                  />
                </div>
              )}
              <div>
                <label className={cx.label}>Pais</label>
                <CustomSelect
                  value={profileForm.pais}
                  onChange={(v) => setProfileForm({ ...profileForm, pais: v })}
                  options={PAISES.map(p => ({ value: p.code, label: `${p.name} (${p.simbolo})` }))}
                />
              </div>
            </div>
            <div>
              <label className={cx.label}>Formato de precio</label>
              <CustomSelect
                value={profileForm.precio_decimales}
                onChange={(v) => setProfileForm({ ...profileForm, precio_decimales: v })}
                options={[
                  { value: 'decimales', label: 'Con decimales (S/ 17.90)' },
                  { value: 'enteros', label: 'Sin decimales (S/ 18)' },
                  { value: 'variable', label: 'Variable (muestra ambos)' },
                ]}
              />
            </div>
            <div>
              <label className={cx.label}>Giro de negocio</label>
              <CustomSelect
                value={profileForm.giro_negocio_id}
                onChange={(v) => setProfileForm({ ...profileForm, giro_negocio_id: v })}
                options={[{ value: '', label: 'General' }, ...giros]}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className={cx.btnPrimary + ' flex items-center gap-2'}
              >
                {savingProfile ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Save size={14} /> Guardar</>
                )}
              </button>
              <button onClick={cancelEditing} className={cx.btnSecondary + ' flex items-center gap-1'}>
                <X size={14} /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>DNI</label>
              <p className="text-stone-800 text-sm">{user?.dni || '-'}</p>
            </div>
            <div>
              <label className={cx.label}>RUC</label>
              <p className="text-stone-800 text-sm">{user?.ruc || '-'}</p>
            </div>
            <div>
              <label className={cx.label}>Nombre comercial</label>
              <p className="text-stone-800 text-sm">{user?.empresa || user?.nombre_comercial || '-'}</p>
            </div>
            <div>
              <label className={cx.label}>Razon social</label>
              <p className="text-stone-800 text-sm">{user?.razon_social || '-'}</p>
            </div>
            <div>
              <label className={cx.label}>Tipo de negocio</label>
              <p className="text-stone-800 text-sm">{user?.tipo_negocio === 'informal' ? 'Informal (no paga IGV)' : 'Formal'}</p>
            </div>
            <div>
              <label className={cx.label}>Tasa IGV</label>
              <p className="text-stone-800 text-sm">{user?.tipo_negocio === 'informal' ? 'No aplica' : `${igvDisplay}%`}</p>
            </div>
            <div>
              <label className={cx.label}>Pais</label>
              <p className="text-stone-800 text-sm">{getPaisByCode(user?.pais)?.name || user?.pais || 'Peru'}</p>
            </div>
            <div>
              <label className={cx.label}>Moneda</label>
              <p className="text-stone-800 text-sm">{user?.moneda || 'PEN'} ({user?.simbolo || 'S/'})</p>
            </div>
            <div>
              <label className={cx.label}>Formato de precio</label>
              <p className="text-stone-800 text-sm">
                {user?.precio_decimales === 'decimales' ? 'Con decimales' : user?.precio_decimales === 'enteros' ? 'Sin decimales' : 'Variable (ambos)'}
              </p>
            </div>
            <div>
              <label className={cx.label}>Giro de negocio</label>
              <p className="text-stone-800 text-sm">{user?.giro_nombre || 'General'}</p>
            </div>
            <div>
              <label className={cx.label}>Rol</label>
              <p className="text-stone-800 text-sm capitalize">{user?.rol || 'cliente'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Theme selector */}
      <div className={`${cx.card} p-4`}>
        <h3 className="text-lg font-semibold text-stone-900 mb-3">Tema</h3>
        <div className="flex gap-3">
          {[
            { key: 'menta', color: '#059669', name: 'Menta' },
            { key: 'coral', color: '#e8590c', name: 'Coral' },
            { key: 'lavanda', color: '#4f46e5', name: 'Lavanda' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                if (t.key === 'menta') {
                  localStorage.removeItem('nodum_theme');
                  document.documentElement.removeAttribute('data-theme');
                } else {
                  localStorage.setItem('nodum_theme', t.key);
                  document.documentElement.setAttribute('data-theme', t.key);
                }
                window.location.reload();
              }}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                (!localStorage.getItem('nodum_theme') && t.key === 'menta') || localStorage.getItem('nodum_theme') === t.key
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <div className="w-8 h-8 rounded-full" style={{ background: t.color }} />
              <span className="text-xs text-stone-600 font-medium">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Change password */}
      <div className={`${cx.card} p-4`}>
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-stone-400" />
          <h3 className="text-lg font-semibold text-stone-900">Cambiar contrasena</h3>
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

      {/* Ajustes globales */}
      <div className={`${cx.card} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-stone-400" />
            <h3 className="text-lg font-semibold text-stone-900">Ajustes globales</h3>
          </div>
          {!editingAjustes && (
            <button onClick={startEditingAjustes} className={cx.btnGhost + ' flex items-center gap-1'}>
              <Pencil size={14} /> Editar
            </button>
          )}
        </div>

        {editingAjustes ? (
          <div className="space-y-4">
            <div>
              <label className={cx.label}>Tarifa mano de obra / hora ({user?.simbolo || 'S/'})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ej: 15.00"
                value={ajustesForm.tarifa_mo_global}
                onChange={(e) => setAjustesForm({ ...ajustesForm, tarifa_mo_global: e.target.value })}
                className={cx.input + ' max-w-xs'}
              />
              <p className="text-xs text-stone-400 mt-1">Se usa en la ficha técnica para calcular costo de mano de obra</p>
            </div>
            <div>
              <label className={cx.label}>Margen mínimo objetivo (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="99"
                value={ajustesForm.margen_minimo_global}
                onChange={(e) => setAjustesForm({ ...ajustesForm, margen_minimo_global: e.target.value })}
                className={cx.input + ' max-w-xs'}
              />
              <p className="text-xs text-stone-400 mt-1">Alerta si un producto está por debajo de este margen</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveAjustes}
                disabled={savingAjustes}
                className={cx.btnPrimary + ' flex items-center gap-2'}
              >
                {savingAjustes ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Save size={14} /> Guardar</>
                )}
              </button>
              <button onClick={() => setEditingAjustes(false)} className={cx.btnSecondary + ' flex items-center gap-1'}>
                <X size={14} /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>Tarifa MO / hora</label>
              <p className="text-stone-800 text-sm">
                {user?.tarifa_mo_global ? `${user?.simbolo || 'S/'} ${Number(user.tarifa_mo_global).toFixed(2)}` : 'No configurada'}
              </p>
            </div>
            <div>
              <label className={cx.label}>Margen mínimo</label>
              <p className="text-stone-800 text-sm">{user?.margen_minimo_global || 33}%</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
