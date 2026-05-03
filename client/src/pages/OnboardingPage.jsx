import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { cx } from '../styles/tokens';
import CustomSelect from '../components/CustomSelect';
import { Loader2 } from 'lucide-react';


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
  const [giros, setGiros] = useState([]);

  const [form, setForm] = useState({
    nombre: '',
    dni: '',
    ruc: '',
    razon_social: '',
    tipo_contribuyente: '',
    nombre_comercial: '',
    giro_negocio_id: '',
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
    fetch(`${API_BASE}/auth/giros`)
      .then((r) => r.json())
      .then((d) => {
        setGiros((d.data?.giros || []).map(g => ({ value: g.id, label: g.nombre })));
      })
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
      <div className="min-h-screen bg-[#0A2F24] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px'}} />
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!inviteToken || !valid) {
    return (
      <div className="min-h-screen bg-[#0A2F24] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px'}} />
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl relative z-10">
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
      <div className="min-h-screen bg-[#0A2F24] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px'}} />
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl relative z-10">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-600 text-2xl">&#10003;</span>
          </div>
          <h2 className="text-stone-800 text-lg font-semibold mb-2">Registro completado</h2>
          <p className="text-stone-500 text-sm">Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A2F24] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px'}} />
      <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-xl relative z-10">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-kudi.jpg" className="w-20 h-20 mx-auto mb-4 rounded-2xl" alt="Kudi" />
          <h1 className="text-2xl font-bold text-stone-900">Kudi</h1>
          <p className="text-stone-500 text-sm mt-1">Completa tu registro</p>
          {inviteData?.email && (
            <p className="text-stone-400 text-xs mt-1">{inviteData.email}</p>
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
            <label className={cx.label}>Giro de negocio</label>
            <CustomSelect
              value={form.giro_negocio_id || ''}
              onChange={v => setForm({...form, giro_negocio_id: v})}
              options={giros}
              placeholder="¿Qué tipo de negocio tienes?"
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
            <label className={cx.label}>Tipo de contribuyente</label>
            <CustomSelect
              value={form.tipo_negocio === 'informal' ? 'no_igv' : `formal_${form.igv_rate}`}
              onChange={(val) => {
                if (val === 'no_igv') {
                  setForm(prev => ({ ...prev, tipo_negocio: 'informal', igv_rate: '0' }));
                } else if (val === 'formal_10.5') {
                  setForm(prev => ({ ...prev, tipo_negocio: 'formal', igv_rate: '10.5' }));
                } else {
                  setForm(prev => ({ ...prev, tipo_negocio: 'formal', igv_rate: '18' }));
                }
              }}
              options={[
                { value: 'formal_18', label: 'Formal (IGV 18%)' },
                { value: 'formal_10.5', label: 'Formal (IGV 10.5%)' },
                { value: 'no_igv', label: 'No paga IGV' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>Contrasena</label>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
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
