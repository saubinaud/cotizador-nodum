import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Calculator,
  Salad,
  Package,
  ChefHat,
  BoxSelect,
  User,
  Users,
  Activity,
  TrendingUp,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const allLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/cotizador', label: 'Cotizador', icon: Calculator, perm: 'cotizador' },
  { to: '/insumos', label: 'Insumos', icon: Salad, perm: 'insumos' },
  { to: '/materiales', label: 'Materiales', icon: Package, perm: 'materiales' },
  { to: '/preparaciones-predeterminadas', label: 'Prep. Predet.', icon: ChefHat, perm: 'preparaciones' },
  { to: '/empaques-predeterminados', label: 'Empaques Pred.', icon: BoxSelect, perm: 'empaques' },
  { to: '/proyeccion', label: 'Proyección', icon: TrendingUp, perm: 'cotizador' },
  { to: '/actividad', label: 'Mi Actividad', icon: Activity },
  { to: '/perfil', label: 'Perfil', icon: User },
];

const adminLinks = [
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { to: '/admin/actividad', label: 'Actividad', icon: Activity },
];

function SidebarLink({ to, label, icon: Icon, onClick, collapsed }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} ${collapsed ? 'px-0 py-3' : 'px-4 py-3'} rounded-xl text-sm font-semibold transition-all duration-200 ${
          isActive
            ? 'bg-[var(--accent-light)] text-[var(--accent)]'
            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
        }`
      }
    >
      <Icon size={18} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nodum_sidebar_collapsed') === 'true');

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('nodum_sidebar_collapsed', String(next));
  };
  const isAdmin = user?.rol === 'admin';
  const permisos = Array.isArray(user?.permisos) ? user.permisos : ['dashboard', 'cotizador', 'insumos', 'materiales', 'preparaciones', 'empaques', 'proyeccion'];
  const links = isAdmin ? allLinks : allLinks.filter((l) => !l.perm || permisos.includes(l.perm));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setOpen(false);

  const renderSidebarContent = (isCollapsed) => (
    <>
      <div className={`${isCollapsed ? 'p-3' : 'p-5'} border-b border-stone-200`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          {user?.logo_url ? (
            <img src={user.logo_url} alt="Logo" className="w-9 h-9 rounded-xl object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <Calculator size={18} className="text-white" />
            </div>
          )}
          {!isCollapsed && (
            <div>
              <h1 className="text-base font-bold text-stone-800 tracking-wide">Kudi</h1>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest">Cotizador</p>
            </div>
          )}
        </div>
      </div>

      <nav className={`flex-1 ${isCollapsed ? 'px-2' : 'px-4'} py-4 space-y-1 overflow-y-auto`}>
        {links.map((l) => (
          <SidebarLink key={l.to} {...l} onClick={closeSidebar} collapsed={isCollapsed} />
        ))}
        {isAdmin && (
          <>
            {!isCollapsed && (
              <div className="mt-4 mb-2 px-3">
                <p className="text-[10px] text-stone-400 uppercase tracking-widest font-semibold">
                  Admin
                </p>
              </div>
            )}
            {isCollapsed && <div className="mt-4 mb-2 border-t border-stone-200" />}
            {adminLinks.map((l) => (
              <SidebarLink key={l.to} {...l} onClick={closeSidebar} collapsed={isCollapsed} />
            ))}
          </>
        )}
      </nav>

      {isCollapsed && (
        <div className="flex justify-center py-2 border-t border-stone-200">
          <button
            onClick={toggleCollapsed}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            title="Expandir menu"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {!isCollapsed && (
        <div className="flex justify-center py-2 border-t border-stone-200">
          <button
            onClick={toggleCollapsed}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            title="Contraer menu"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      <div className={`p-3 border-t border-stone-200`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2`}>
          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-500 shrink-0">
            {user?.nombre?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-800 truncate">{user?.nombre || 'Usuario'}</p>
                <p className="text-[10px] text-stone-400 truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-stone-400 hover:text-rose-500 transition-colors rounded-lg">
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex ${collapsed ? 'w-16' : 'w-56'} flex-col bg-white border-r border-stone-100 fixed inset-y-0 left-0 z-30 transition-all duration-200`}>
        {renderSidebarContent(collapsed)}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeSidebar} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-white border-r border-stone-200 flex flex-col">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 p-1 text-stone-400 hover:text-stone-800"
            >
              <X size={20} />
            </button>
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 ${collapsed ? 'lg:ml-16' : 'lg:ml-56'} transition-all duration-200`}>
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 text-stone-400 hover:text-stone-800">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            {user?.logo_url ? (
              <img src={user.logo_url} alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
                <Calculator size={14} className="text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-stone-800">Kudi</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="p-5 pb-16 lg:p-8 lg:pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
