import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A2F24] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Noise/grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
      }} />
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-gradient-radial from-[#16A34A]/5 via-transparent to-transparent" style={{
        background: 'radial-gradient(ellipse at 50% 30%, rgba(22,163,74,0.08) 0%, transparent 70%)',
      }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <img src="/logo-kudi.jpg" alt="Kudi" className="w-24 h-24 mx-auto mb-5 rounded-2xl drop-shadow-lg" />
          <h1 className="text-3xl font-bold text-white tracking-wider">KUDI</h1>
          <p className="text-white/40 text-sm mt-2">Orden financiero que impulsa tu crecimiento</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={cx.label}>Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cx.input}
              placeholder="tu@email.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label className={cx.label}>Contrasena</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cx.input + ' pr-10'}
                placeholder="Tu contrasena"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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
              'Ingresar'
            )}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
