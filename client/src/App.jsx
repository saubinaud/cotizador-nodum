import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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
import ProyeccionPage from './pages/ProyeccionPage';
import ActividadPage from './pages/ActividadPage';
import PLTimelinePage from './pages/PLTimelinePage';
import PLResumenPage from './pages/PLResumenPage';
import PLVentasPage from './pages/PLVentasPage';
import PLGastosPage from './pages/PLGastosPage';
import PLComprasPage from './pages/PLComprasPage';
import PLCashflowPage from './pages/PLCashflowPage';
import PerdidasPage from './pages/PerdidasPage';
import ClientesPage from './pages/ClientesPage';
import ComprobantesPage from './pages/ComprobantesPage';
import FichaTecnicaPage from './pages/FichaTecnicaPage';
import PedidosPage from './pages/PedidosPage';
import EquipoPage from './pages/EquipoPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <ScrollToTop />
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
              <Route path="/proyeccion" element={<ProyeccionPage />} />
              <Route path="/actividad" element={<ActividadPage />} />
              <Route path="/pl" element={<PLTimelinePage />} />
              <Route path="/pl/resumen" element={<PLResumenPage />} />
              <Route path="/pl/ventas" element={<PLVentasPage />} />
              <Route path="/pl/gastos" element={<PLGastosPage />} />
              <Route path="/pl/compras" element={<PLComprasPage />} />
              <Route path="/pl/cashflow" element={<PLCashflowPage />} />
              <Route path="/perdidas" element={<PerdidasPage />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/pedidos" element={<PedidosPage />} />
              <Route path="/comprobantes" element={<ComprobantesPage />} />
              <Route path="/ficha-tecnica/:id" element={<FichaTecnicaPage />} />
              <Route path="/equipo" element={<EquipoPage />} />
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
