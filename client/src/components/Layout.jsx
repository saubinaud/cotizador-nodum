import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TerminosProvider } from '../context/TerminosContext';
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
  ChevronDown,
  ChevronUp,
  DollarSign,
  BarChart3,
  ShoppingCart,
  Receipt,
  ShoppingBag,
  TrendingDown,
  Wallet,
  Clock,
  Lock,
  FileText,
  ClipboardList,
} from 'lucide-react';


function SidebarLink({ to, label, icon: Icon, onClick, collapsed, end, disabled }) {
  if (disabled) {
    return (
      <div
        title={collapsed ? `${label} (bloqueado)` : 'Módulo no disponible en tu plan'}
        className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} ${collapsed ? 'px-0 py-3' : 'px-4 py-3'} rounded-xl text-sm font-semibold text-white/20 cursor-not-allowed`}
      >
        <Icon size={18} />
        {!collapsed && (
          <>
            <span className="flex-1">{label}</span>
            <Lock size={12} className="text-white/20" />
          </>
        )}
      </div>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} ${collapsed ? 'px-0 py-3' : 'px-4 py-3'} rounded-xl text-sm font-semibold transition-all duration-200 ${
          isActive
            ? 'bg-white/10 text-[#4ADE80]'
            : 'text-white/60 hover:text-white hover:bg-white/5'
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

  const t = user?.giro_terminos || {};

  const sidebarGroups = [
    {
      key: 'cotizador',
      label: 'Cotizador',
      icon: Calculator,
      links: [
        { to: '/dashboard', label: t.productos || 'Productos', icon: LayoutDashboard, perm: 'dashboard' },
        { to: '/cotizador', label: 'Nuevo', icon: Calculator, perm: 'cotizador' },
        { to: '/insumos', label: t.insumos || 'Insumos', icon: Salad, perm: 'insumos' },
        { to: '/materiales', label: t.materiales || 'Materiales', icon: Package, perm: 'materiales' },
        { to: '/preparaciones-predeterminadas', label: t.prep_pred || 'Prep. Predet.', icon: ChefHat, perm: 'preparaciones' },
        { to: '/empaques-predeterminados', label: 'Empaques', icon: BoxSelect, perm: 'empaques' },
        { to: '/proyeccion', label: 'Proyeccion', icon: TrendingUp, perm: 'cotizador' },
      ],
    },
    {
      key: 'pl',
      label: 'P&L',
      icon: DollarSign,
      links: [
        { to: '/pl', label: 'Timeline', icon: Activity, perm: 'pl', end: true },
        { to: '/pl/resumen', label: 'Estado de resultados', icon: BarChart3, perm: 'pl' },
        { to: '/pl/ventas', label: 'Ventas', icon: ShoppingCart, perm: 'pl' },
        { to: '/pedidos', label: 'Pedidos', icon: ClipboardList, perm: 'pl' },
        { to: '/pl/compras', label: 'Compras', icon: ShoppingBag, perm: 'pl' },
        { to: '/pl/gastos', label: 'Gastos', icon: Receipt, perm: 'pl' },
        { to: '/pl/cashflow', label: 'Flujo de Caja', icon: Wallet, perm: 'pl' },
      ],
    },
    {
      key: 'perdidas',
      label: 'Pérdidas',
      icon: TrendingDown,
      links: [
        { to: '/perdidas', label: 'Registro', icon: TrendingDown, perm: 'perdidas' },
      ],
    },
    {
      key: 'facturacion',
      label: 'Facturación',
      icon: FileText,
      links: [
        { to: '/comprobantes', label: 'Comprobantes', icon: FileText, perm: 'facturacion' },
        { to: '/clientes', label: 'Clientes', icon: Users, perm: 'facturacion' },
      ],
    },
  ];

  const standaloneLinks = [
    { to: '/actividad', label: 'Mi Actividad', icon: Activity },
    { to: '/perfil', label: 'Perfil', icon: User },
  ];

  const adminLinks = [
    { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
    { to: '/admin/actividad', label: 'Actividad', icon: Activity },
  ];
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nodum_sidebar_collapsed') === 'true');
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kudi_nav_groups') || '{}'); } catch { return {}; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('nodum_sidebar_collapsed', String(next));
  };
  const toggleGroup = (key) => {
    const next = { ...collapsedGroups, [key]: !collapsedGroups[key] };
    setCollapsedGroups(next);
    localStorage.setItem('kudi_nav_groups', JSON.stringify(next));
  };
  const isAdmin = user?.rol === 'admin';
  const rawPermisos = Array.isArray(user?.permisos) ? user.permisos : ['dashboard', 'cotizador', 'insumos', 'materiales', 'preparaciones', 'empaques', 'proyeccion', 'pl', 'perdidas'];
  // Parse 3-state permisos: "modulo" = full, "~modulo" = vitrina (visible but locked), absent = hidden
  const permState = (perm) => {
    if (!perm) return 'full';
    if (isAdmin) return 'full';
    if (rawPermisos.includes(perm)) return 'full';
    if (rawPermisos.includes(`~${perm}`)) return 'vitrina';
    return 'hidden';
  };

  const trialBanner = (() => {
    if (!user || user.rol === 'admin' || user.plan === 'pro') return null;
    if (!user.trial_ends_at) return null;

    const now = new Date();
    const ends = new Date(user.trial_ends_at);
    const diffMs = ends - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      return { type: 'info', text: `Prueba gratis — ${diffDays} dias restantes`, color: 'bg-blue-50 text-blue-700 border-blue-200' };
    } else if (diffDays > 0) {
      return { type: 'warning', text: `Tu prueba gratis termina en ${diffDays} dia${diffDays > 1 ? 's' : ''}`, color: 'bg-amber-50 text-amber-700 border-amber-200' };
    } else if (diffDays === 0) {
      return { type: 'danger', text: 'Tu prueba gratis termina hoy', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    } else {
      return { type: 'expired', text: 'Tu prueba gratis ha terminado', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
  })();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setOpen(false);

  const renderSidebarContent = (isCollapsed) => (
    <>
      <div className={`${isCollapsed ? 'p-3' : 'p-5'} border-b border-white/10`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          {user?.logo_url ? (
            <img src={user.logo_url} alt="Logo" className="w-9 h-9 rounded-xl object-cover" />
          ) : (
            <img src="/logo-kudi.jpg" alt="Kudi" className="w-9 h-9 rounded-xl object-cover" />
          )}
          {!isCollapsed && (
            <h1 className="text-base font-bold text-white tracking-wide">Kudi</h1>
          )}
        </div>
      </div>

      <nav className={`flex-1 ${isCollapsed ? 'px-2' : 'px-4'} py-4 space-y-1 overflow-y-auto`}>
        {sidebarGroups.map((group) => {
          const visibleLinks = group.links
            .map(l => ({ ...l, _state: permState(l.perm) }))
            .filter(l => isAdmin || l._state !== 'hidden');
          if (visibleLinks.length === 0) return null;
          const isGroupCollapsed = collapsedGroups[group.key];

          return (
            <div key={group.key}>
              <button onClick={() => toggleGroup(group.key)} className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60">
                <div className="flex items-center gap-2">
                  <group.icon size={14} />
                  {!isCollapsed && <span>{group.label}</span>}
                </div>
                {!isCollapsed && (isGroupCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
              </button>
              {!isGroupCollapsed && visibleLinks.map(l => (
                <SidebarLink key={l.to} {...l} disabled={l._state === 'vitrina'} collapsed={isCollapsed} onClick={closeSidebar} />
              ))}
            </div>
          );
        })}
        {standaloneLinks.map((l) => (
          <SidebarLink key={l.to} {...l} onClick={closeSidebar} collapsed={isCollapsed} />
        ))}
        {isAdmin && (
          <>
            {!isCollapsed && (
              <div className="mt-4 mb-2 px-3">
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">
                  Admin
                </p>
              </div>
            )}
            {isCollapsed && <div className="mt-4 mb-2 border-t border-white/10" />}
            {adminLinks.map((l) => (
              <SidebarLink key={l.to} {...l} onClick={closeSidebar} collapsed={isCollapsed} />
            ))}
          </>
        )}
      </nav>

      {isCollapsed && (
        <div className="flex justify-center py-2 border-t border-white/10">
          <button
            onClick={toggleCollapsed}
            className="p-2 text-white/40 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"
            title="Expandir menu"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {!isCollapsed && (
        <div className="flex justify-center py-2 border-t border-white/10">
          <button
            onClick={toggleCollapsed}
            className="p-2 text-white/40 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"
            title="Contraer menu"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      <div className={`p-3 border-t border-white/10`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2`}>
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/70 shrink-0">
            {user?.nombre?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{user?.nombre || 'Usuario'}</p>
                <p className="text-[10px] text-white/40 truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-white/40 hover:text-rose-400 transition-colors rounded-lg">
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F5] flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex ${collapsed ? 'w-16' : 'w-56'} flex-col bg-[#0A2F24] fixed inset-y-0 left-0 z-30 transition-all duration-200 relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px'}} />
        {renderSidebarContent(collapsed)}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeSidebar} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-[#0A2F24] flex flex-col">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 p-1 text-white/40 hover:text-white"
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
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0A2F24] sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 text-white/60 hover:text-white">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            {user?.logo_url ? (
              <img src={user.logo_url} alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <img src="/logo-kudi.jpg" alt="Kudi" className="w-7 h-7 rounded-lg object-cover" />
            )}
            <span className="text-sm font-bold text-white">Kudi</span>
          </div>
          <div className="w-9" />
        </header>

        {trialBanner && (
          <div className={`${trialBanner.color} border-b px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2`}>
            <Clock size={14} />
            <span>{trialBanner.text}</span>
            {trialBanner.type === 'expired' && (
              <span className="font-bold ml-1">— Contacta al administrador para activar tu cuenta</span>
            )}
          </div>
        )}

        <main className="p-3 pb-14 lg:px-4 lg:py-3 lg:pb-14">
          <TerminosProvider terminos={user?.giro_terminos}>
            <Outlet />
          </TerminosProvider>
        </main>
      </div>
    </div>
  );
}
