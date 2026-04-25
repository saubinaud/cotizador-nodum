import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { cx } from '../styles/tokens';
import CustomSelect from '../components/CustomSelect';
import { Calculator, Loader2 } from 'lucide-react';


export default function OnboardingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = params.get('token');

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [paises, setPaises] = useState([]);

  const [form, setForm] = useState({
    nombre: '',
    dni: '',
    ruc: '',
    razon_social: '',
    tipo_contribuyente: '',
    nombre_comercial: '',
    igv_rate: '18',
    pais: 'PE',
    tipo_negocio: 'formal',
    password: '',
    password_confirm: '',
  });

  useEffect(() => {
    fetch(`${API_BASE}/auth/paises`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setPaises(data.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setValidating(false);
      return;
    }
    fetch(`${API_BASE}/onboarding/validar?token=${inviteToken}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setValid(true);
        setInviteData(data);
      })
      .catch(() => setValid(false))
      .finally(() => setValidating(false));
  }, [inviteToken]);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));

    if (field === 'ruc' && val.length === 11) {
      fetch(`${API_BASE}/onboarding/consulta-ruc/${val}`)
        .then((r) => r.json())
        .then((data) => {
          setForm((prev) => ({
            ...prev,
            razon_social: data.razon_social || '',
            tipo_contribuyente: data.tipo_contribuyente || '',
          }));
        })
        .catch(() => {});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.dni.length !== 8) {
      setError('El DNI debe tener 8 digitos');
      return;
    }
    if (form.ruc && form.ruc.length !== 11) {
      setError('El RUC debe tener 11 digitos');
      return;
    }
    if (form.password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (form.password !== form.password_confirm) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/onboarding/completar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, token: inviteToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error al completar registro');
      }
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
      </div>
    );
  }

  if (!inviteToken || !valid) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className={`${cx.card} p-8 max-w-sm w-full text-center`}>
          <h2 className="text-stone-800 text-lg font-semibold mb-2">Enlace invalido</h2>
          <p className="text-stone-500 text-sm">
            Este enlace de invitacion no es valido o ya fue utilizado.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className={`${cx.card} p-8 max-w-sm w-full text-center`}>
          <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-4">
            <span className="text-[var(--success)] text-2xl">&#10003;</span>
          </div>
          <h2 className="text-stone-800 text-lg font-semibold mb-2">Registro completado</h2>
          <p className="text-stone-500 text-sm">Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className={`${cx.card} w-full max-w-lg p-8`}>
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-3">
            <Calculator size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Completa tu registro</h1>
          {inviteData?.email && (
            <p className="text-stone-500 text-sm mt-1">{inviteData.email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={cx.label}>Nombre completo</label>
            <input
              type="text"
              value={form.nombre}
              onChange={handleChange('nombre')}
              className={cx.input}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>DNI (8 digitos)</label>
              <input
                type="text"
                value={form.dni}
                onChange={handleChange('dni')}
                className={cx.input}
                maxLength={8}
                pattern="[0-9]{8}"
                required
              />
            </div>
            <div>
              <label className={cx.label}>RUC (11 digitos)</label>
              <input
                type="text"
                value={form.ruc}
                onChange={handleChange('ruc')}
                className={cx.input}
                maxLength={11}
              />
            </div>
          </div>

          {form.razon_social && (
            <div className="bg-stone-100 rounded-xl p-3 space-y-1">
              <p className="text-xs text-stone-400">Razon social</p>
              <p className="text-sm text-stone-800">{form.razon_social}</p>
              {form.tipo_contribuyente && (
                <>
                  <p className="text-xs text-stone-400 mt-2">Tipo contribuyente</p>
                  <p className="text-sm text-stone-800">{form.tipo_contribuyente}</p>
                </>
              )}
            </div>
          )}

          <div>
            <label className={cx.label}>Nombre comercial</label>
            <input
              type="text"
              value={form.nombre_comercial}
              onChange={handleChange('nombre_comercial')}
              className={cx.input}
            />
          </div>

          <div>
            <label className={cx.label}>Pais</label>
            <CustomSelect
              value={form.pais}
              onChange={(code) => setForm((prev) => ({ ...prev, pais: code }))}
              options={paises.map(p => ({ value: p.code, label: `${p.nombre} (${p.simbolo} ${p.moneda})` }))}
            />
          </div>

          <div>
            <label className={cx.label}>Tipo de negocio</label>
            <CustomSelect
              value={form.tipo_negocio}
              onChange={(val) => {
                setForm((prev) => ({
                  ...prev,
                  tipo_negocio: val,
                  ...(val === 'informal' ? { igv_rate: '0' } : { igv_rate: '18' }),
                }));
              }}
              options={[
                { value: 'formal', label: 'Formal (paga IGV)' },
                { value: 'informal', label: 'Informal (no paga IGV)' },
              ]}
            />
          </div>

          {form.tipo_negocio !== 'informal' && (
            <div>
              <label className={cx.label}>Tasa IGV</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                  <input
                    type="radio"
                    name="igv_rate"
                    value="18"
                    checked={form.igv_rate === '18'}
                    onChange={handleChange('igv_rate')}
                    className="accent-[var(--accent)]"
                  />
                  18%
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                  <input
                    type="radio"
                    name="igv_rate"
                    value="10.5"
                    checked={form.igv_rate === '10.5'}
                    onChange={handleChange('igv_rate')}
                    className="accent-[var(--accent)]"
                  />
                  10.5%
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>Contrasena</label>
              <input
                type="password"
                value={form.password}
                onChange={handleChange('password')}
                className={cx.input}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className={cx.label}>Confirmar</label>
              <input
                type="password"
                value={form.password_confirm}
                onChange={handleChange('password_confirm')}
                className={cx.input}
                required
              />
            </div>
          </div>

          {error && (
            <div className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cx.btnPrimary + ' w-full flex items-center justify-center gap-2'}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Completar registro'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
