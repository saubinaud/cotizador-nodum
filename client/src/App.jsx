import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import CotizadorPage from './pages/CotizadorPage';
import InsumosPage from './pages/InsumosPage';
import MaterialesPage from './pages/MaterialesPage';
import PrepPredPage from './pages/PrepPredPage';
import EmpaquePredPage from './pages/EmpaquePredPage';
import PerfilPage from './pages/PerfilPage';
import AdminUsuariosPage from './pages/AdminUsuariosPage';
import AdminActividadPage from './pages/AdminActividadPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Protected routes with layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cotizador" element={<CotizadorPage />} />
              <Route path="/cotizador/:id" element={<CotizadorPage />} />
              <Route path="/insumos" element={<InsumosPage />} />
              <Route path="/materiales" element={<MaterialesPage />} />
              <Route path="/preparaciones-predeterminadas" element={<PrepPredPage />} />
              <Route path="/empaques-predeterminados" element={<EmpaquePredPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
            </Route>

            {/* Admin routes with layout */}
            <Route
              element={
                <AdminRoute>
                  <Layout />
                </AdminRoute>
              }
            >
              <Route path="/admin/usuarios" element={<AdminUsuariosPage />} />
              <Route path="/admin/actividad" element={<AdminActividadPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
