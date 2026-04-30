// Permission matrix: rol_empresa -> recurso -> acciones allowed
const PERMISOS = {
  owner: '*', // all access
  manager: {
    productos: ['ver', 'crear', 'editar'],
    insumos: ['ver', 'crear', 'editar'],
    materiales: ['ver', 'crear', 'editar'],
    preparaciones: ['ver', 'crear', 'editar'],
    ventas: ['ver', 'crear', 'editar'],
    pedidos: ['ver', 'crear', 'editar', 'entregar', 'pagar'],
    gastos: ['ver', 'crear', 'editar'],
    compras: ['ver', 'crear', 'editar'],
    financiero: ['ver', 'crear'],
    facturacion: ['ver', 'emitir'],
    clientes: ['ver', 'crear', 'editar'],
    reportes: ['ver'],
  },
  cashier: {
    productos: ['ver'],
    insumos: ['ver'],
    materiales: ['ver'],
    ventas: ['ver', 'crear'],
    pedidos: ['ver', 'crear', 'entregar', 'pagar'],
    clientes: ['ver', 'crear'],
    facturacion: ['ver', 'emitir'],
  },
  kitchen: {
    productos: ['ver'],
    insumos: ['ver'],
    materiales: ['ver'],
    preparaciones: ['ver'],
    pedidos: ['ver'],
  },
  viewer: {
    productos: ['ver'],
    ventas: ['ver'],
    reportes: ['ver'],
    pedidos: ['ver'],
  },
  vendedor: {
    productos: ['ver'],
    ventas: ['ver', 'crear'],
    pedidos: ['ver', 'crear', 'entregar', 'pagar'],
    clientes: ['ver', 'crear', 'editar'],
    facturacion: ['ver', 'emitir'],
  },
  repartidor: {
    pedidos: ['ver', 'entregar'],
    clientes: ['ver'],
  },
  contador: {
    productos: ['ver'],
    ventas: ['ver'],
    financiero: ['ver'],
    facturacion: ['ver'],
    reportes: ['ver'],
    clientes: ['ver'],
  },
};

function requirePermiso(recurso, accion) {
  return (req, res, next) => {
    const rol = req.user?.rol_empresa || 'owner';

    // Platform admin bypasses
    if (req.user?.rol === 'admin') return next();

    // Owner has all permissions
    if (rol === 'owner' || PERMISOS[rol] === '*') return next();

    const permsForRol = PERMISOS[rol];
    if (!permsForRol) return res.status(403).json({ success: false, error: 'Rol no reconocido' });

    const allowed = permsForRol[recurso];
    if (!allowed || !allowed.includes(accion)) {
      return res.status(403).json({ success: false, error: 'Sin permisos para esta accion' });
    }

    next();
  };
}

module.exports = { requirePermiso, PERMISOS };
