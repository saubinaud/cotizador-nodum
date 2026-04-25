import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import { Calculator, Eye, EyeOff } from 'lucide-react';

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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className={`${cx.card} w-full max-w-sm p-8`}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4 shadow-lg shadow-[var(--accent)]/20">
            <Calculator size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-wide">Kudi</h1>
          <p className="text-stone-500 text-sm mt-1">Cotizador de productos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={cx.label}>Email</label>
            <input
              type="email"
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
  );
}
