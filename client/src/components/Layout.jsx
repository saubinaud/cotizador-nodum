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
} from 'lucide-react';

const allLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/cotizador', label: 'Cotizador', icon: Calculator, perm: 'cotizador' },
  { to: '/insumos', label: 'Insumos', icon: Salad, perm: 'insumos' },
  { to: '/materiales', label: 'Materiales', icon: Package, perm: 'materiales' },
  { to: '/preparaciones-predeterminadas', label: 'Prep. Predet.', icon: ChefHat, perm: 'preparaciones' },
  { to: '/empaques-predeterminados', label: 'Empaques Pred.', icon: BoxSelect, perm: 'empaques' },
  { to: '/proyeccion', label: 'Proyección', icon: TrendingUp, perm: 'cotizador' },
  { to: '/perfil', label: 'Perfil', icon: User },
];

const adminLinks = [
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { to: '/admin/actividad', label: 'Actividad', icon: Activity },
];

function SidebarLink({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-[#FA7B21]/15 to-transparent text-[#FA7B21] border-l-2 border-[#FA7B21]'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.rol === 'admin';
  const permisos = Array.isArray(user?.permisos) ? user.permisos : ['dashboard', 'cotizador', 'insumos', 'materiales', 'preparaciones', 'empaques'];
  const links = isAdmin ? allLinks : allLinks.filter((l) => !l.perm || permisos.includes(l.perm));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setOpen(false);

  const sidebarContent = (
    <>
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FA7B21] to-[#FCA929] flex items-center justify-center">
            <Calculator size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">NODUM</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Cotizador</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {links.map((l) => (
          <SidebarLink key={l.to} {...l} onClick={closeSidebar} />
        ))}
        {isAdmin && (
          <>
            <div className="mt-4 mb-2 px-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
                Admin
              </p>
            </div>
            {adminLinks.map((l) => (
              <SidebarLink key={l.to} {...l} onClick={closeSidebar} />
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
            {user?.nombre?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{user?.nombre || 'Usuario'}</p>
            <p className="text-[10px] text-zinc-500 truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors rounded-lg">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-col bg-zinc-900 border-r border-zinc-800 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeSidebar} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-60">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 text-zinc-400 hover:text-white">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FA7B21] to-[#FCA929] flex items-center justify-center">
              <Calculator size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-white">NODUM</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
