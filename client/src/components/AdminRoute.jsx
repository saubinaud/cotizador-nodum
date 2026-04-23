import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }) {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#FA7B21] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;
  if (user?.rol !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}
