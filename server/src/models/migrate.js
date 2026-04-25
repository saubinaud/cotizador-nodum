const pool = require('./db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    // producto_materiales — may not exist in original schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS producto_materiales (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        material_id INTEGER NOT NULL REFERENCES materiales(id),
        cantidad NUMERIC(12,4) NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // producto_versiones — add costo_neto / precio_final if missing
    await client.query(`
      ALTER TABLE producto_versiones
        ADD COLUMN IF NOT EXISTS costo_neto NUMERIC(12,4),
        ADD COLUMN IF NOT EXISTS precio_final NUMERIC(12,4)
    `);

    // usuarios — add permisos column if missing
    await client.query(`
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '["dashboard","cotizador","insumos","materiales","preparaciones","empaques","proyeccion"]'::jsonb
    `);

    // productos — add imagen_url, tipo_presentacion, unidades_por_producto
    await client.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS imagen_url TEXT,
        ADD COLUMN IF NOT EXISTS tipo_presentacion VARCHAR(20) NOT NULL DEFAULT 'unidad',
        ADD COLUMN IF NOT EXISTS unidades_por_producto INTEGER NOT NULL DEFAULT 1
    `);

    // producto_preparaciones — add cantidad_por_unidad for porciones
    await client.query(`
      ALTER TABLE producto_preparaciones
        ADD COLUMN IF NOT EXISTS cantidad_por_unidad NUMERIC(12,4)
    `);

    // productos — add margen_porcion
    await client.query(`
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS margen_porcion NUMERIC(5,4)
    `);

    // uso_unidad en insumos de preparaciones
    await client.query(`ALTER TABLE prep_pred_insumos ADD COLUMN IF NOT EXISTS uso_unidad VARCHAR(10)`);
    await client.query(`ALTER TABLE producto_prep_insumos ADD COLUMN IF NOT EXISTS uso_unidad VARCHAR(10)`);

    // Normalized cost architecture
    await client.query(`ALTER TABLE insumos ADD COLUMN IF NOT EXISTS unidad_base VARCHAR(5)`);
    await client.query(`ALTER TABLE insumos ADD COLUMN IF NOT EXISTS costo_base NUMERIC(12,8)`);
    await client.query(`ALTER TABLE producto_prep_insumos ADD COLUMN IF NOT EXISTS cantidad_base NUMERIC(12,4)`);
    await client.query(`ALTER TABLE producto_prep_insumos ADD COLUMN IF NOT EXISTS costo_linea NUMERIC(12,4)`);
    await client.query(`ALTER TABLE prep_pred_insumos ADD COLUMN IF NOT EXISTS cantidad_base NUMERIC(12,4)`);
    await client.query(`ALTER TABLE prep_pred_insumos ADD COLUMN IF NOT EXISTS costo_linea NUMERIC(12,4)`);

    // producto_padre_id for auto-generated unit products
    await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS producto_padre_id INTEGER REFERENCES productos(id) ON DELETE SET NULL`);

    // paises table
    await client.query(`
      CREATE TABLE IF NOT EXISTS paises (
        code VARCHAR(5) PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        moneda VARCHAR(5) NOT NULL,
        simbolo VARCHAR(10) NOT NULL,
        igv_default NUMERIC(5,4) DEFAULT 0.18
      )
    `);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais_code VARCHAR(5) REFERENCES paises(code)`);

    // preparaciones_predeterminadas — add capacidad/unidad_capacidad
    await client.query(`
      ALTER TABLE preparaciones_predeterminadas
        ADD COLUMN IF NOT EXISTS capacidad NUMERIC(12,4),
        ADD COLUMN IF NOT EXISTS unidad_capacidad VARCHAR(20)
    `);

    // producto_materiales — empaque_tipo (entero/unidad)
    await client.query(`
      ALTER TABLE producto_materiales
        ADD COLUMN IF NOT EXISTS empaque_tipo VARCHAR(10) NOT NULL DEFAULT 'entero'
    `);

    // insumo_precios — WAC price history
    await client.query(`
      CREATE TABLE IF NOT EXISTS insumo_precios (
        id SERIAL PRIMARY KEY,
        insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        compra_item_id INTEGER REFERENCES compra_items(id) ON DELETE SET NULL,
        fecha DATE NOT NULL,
        cantidad NUMERIC(12,4) NOT NULL,
        cantidad_base NUMERIC(12,4) NOT NULL,
        precio_total NUMERIC(12,4) NOT NULL,
        costo_por_base NUMERIC(12,8) NOT NULL,
        proveedor VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // metodo_costeo en usuarios
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS metodo_costeo VARCHAR(10) NOT NULL DEFAULT 'wac'`);

    // usuarios — pais, moneda, logo_url
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(5) DEFAULT 'PE'`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS moneda VARCHAR(5) DEFAULT 'PEN'`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS logo_url TEXT`);

    // usuarios — tipo_negocio (formal/informal)
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_negocio VARCHAR(10) NOT NULL DEFAULT 'formal'`);

    // usuarios — precio_decimales (decimales/enteros/variable)
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS precio_decimales VARCHAR(10) NOT NULL DEFAULT 'variable'`);

    // ==================== P&L TABLES ====================

    await client.query(`
      CREATE TABLE IF NOT EXISTS periodos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT 'mensual',
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categorias_gasto (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT 'variable',
        recurrente BOOLEAN NOT NULL DEFAULT false,
        monto_default NUMERIC(12,2),
        orden INTEGER NOT NULL DEFAULT 0,
        activa BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gastos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
        categoria_id INTEGER REFERENCES categorias_gasto(id) ON DELETE SET NULL,
        descripcion VARCHAR(255),
        monto NUMERIC(12,2) NOT NULL,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ventas_periodo (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        descripcion VARCHAR(255),
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_unitario NUMERIC(12,2) NOT NULL,
        monto_total NUMERIC(12,2) NOT NULL,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ==================== TRANSACCIONES (unified P&L) ====================

    await client.query(`
      CREATE TABLE IF NOT EXISTS transacciones (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
        tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('venta', 'gasto', 'compra')),
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        cantidad INTEGER,
        precio_unitario NUMERIC(12,2),
        descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
        descuento_tipo VARCHAR(10) NOT NULL DEFAULT 'none',
        descuento_valor NUMERIC(12,2) NOT NULL DEFAULT 0,
        categoria_id INTEGER REFERENCES categorias_gasto(id) ON DELETE SET NULL,
        compra_id INTEGER REFERENCES compras(id) ON DELETE SET NULL,
        monto NUMERIC(12,2) NOT NULL DEFAULT 0,
        monto_absoluto NUMERIC(12,2) NOT NULL DEFAULT 0,
        descripcion VARCHAR(255),
        nota TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes for transacciones
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_usuario ON transacciones(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_periodo ON transacciones(periodo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON transacciones(tipo)`);

    // Update default permisos to include 'pl'
    await client.query(`
      ALTER TABLE usuarios
        ALTER COLUMN permisos SET DEFAULT '["dashboard","cotizador","insumos","materiales","preparaciones","empaques","proyeccion","pl"]'::jsonb
    `);

    console.log('[migrate] OK');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
