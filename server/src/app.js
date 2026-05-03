const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const onboardingRoutes = require('./routes/onboarding');
const insumosRoutes = require('./routes/insumos');
const materialesRoutes = require('./routes/materiales');
const productosRoutes = require('./routes/productos');
const predeterminadosRoutes = require('./routes/predeterminados');
const historialRoutes = require('./routes/historial');
const plRoutes = require('./routes/pl');
const perdidasRoutes = require('./routes/perdidas');
const flujoRoutes = require('./routes/flujo');
const clientesRoutes = require('./routes/clientes');
const facturacionRoutes = require('./routes/facturacion');
const pedidosRoutes = require('./routes/pedidos');
const canalesRoutes = require('./routes/canales');
const equipoRoutes = require('./routes/equipo');
const analisisRoutes = require('./routes/analisis');
const runMigrations = require('./models/migrate');

const app = express();

runMigrations();

// --------------- Middleware ---------------

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// --------------- Routes ---------------

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/insumos', insumosRoutes);
app.use('/api/materiales', materialesRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/predeterminados', predeterminadosRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/pl', plRoutes);
app.use('/api/perdidas', perdidasRoutes);
app.use('/api/flujo', flujoRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/facturacion', facturacionRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/canales', canalesRoutes);
app.use('/api/equipo', equipoRoutes);
app.use('/api/analisis', analisisRoutes);

// --------------- 404 Handler ---------------

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

// --------------- Error Handler ---------------

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// --------------- Start ---------------

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Cotizador Nodum API running on port ${PORT}`);
});

module.exports = app;
