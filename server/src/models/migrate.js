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

    // Update default permisos to include 'pl' and 'perdidas'
    await client.query(`
      ALTER TABLE usuarios
        ALTER COLUMN permisos SET DEFAULT '["dashboard","cotizador","insumos","materiales","preparaciones","empaques","proyeccion","pl","perdidas"]'::jsonb
    `);

    // ==================== MERMAS & DESMEDROS ====================

    // insumos: merma % promedio
    await client.query(`ALTER TABLE insumos ADD COLUMN IF NOT EXISTS merma_pct NUMERIC(5,2) DEFAULT 0`);

    // preparaciones_predeterminadas: merma % promedio
    await client.query(`ALTER TABLE preparaciones_predeterminadas ADD COLUMN IF NOT EXISTS merma_pct NUMERIC(5,2) DEFAULT 0`);

    // productos: ficha técnica fields
    await client.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS codigo VARCHAR(20),
        ADD COLUMN IF NOT EXISTS tiempo_activo_min INTEGER,
        ADD COLUMN IF NOT EXISTS tiempo_horno_min INTEGER,
        ADD COLUMN IF NOT EXISTS tarifa_mo_override NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS margen_minimo_override NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS cif_gas_unitario NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS cif_overhead_unitario NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS instrucciones_ensamble TEXT
    `);

    // producto_preparaciones: instrucciones por prep
    await client.query(`ALTER TABLE producto_preparaciones ADD COLUMN IF NOT EXISTS instrucciones TEXT`);

    // usuarios: ajustes globales
    await client.query(`
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS tarifa_mo_global NUMERIC(8,2),
        ADD COLUMN IF NOT EXISTS margen_minimo_global NUMERIC(5,2) DEFAULT 33
    `);

    // mediciones_merma_insumo
    await client.query(`
      CREATE TABLE IF NOT EXISTS mediciones_merma_insumo (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        merma_pct NUMERIC(5,2) NOT NULL,
        causa VARCHAR(100),
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // mediciones_merma_preparacion
    await client.query(`
      CREATE TABLE IF NOT EXISTS mediciones_merma_preparacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        preparacion_pred_id INTEGER NOT NULL REFERENCES preparaciones_predeterminadas(id) ON DELETE CASCADE,
        tanda_producida NUMERIC(12,4) NOT NULL,
        cantidad_util NUMERIC(12,4) NOT NULL,
        cantidad_descartada NUMERIC(12,4) NOT NULL,
        merma_pct NUMERIC(5,2) NOT NULL,
        causa VARCHAR(100),
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // desmedros_producto
    await client.query(`
      CREATE TABLE IF NOT EXISTS desmedros_producto (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        unidades INTEGER NOT NULL,
        costo_neto_snapshot NUMERIC(12,4) NOT NULL,
        perdida_total NUMERIC(12,4) NOT NULL,
        causa VARCHAR(50) NOT NULL,
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // desmedros_preparacion
    await client.query(`
      CREATE TABLE IF NOT EXISTS desmedros_preparacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
        preparacion_pred_id INTEGER NOT NULL REFERENCES preparaciones_predeterminadas(id) ON DELETE CASCADE,
        costo_total_tanda NUMERIC(12,4) NOT NULL,
        perdida_total NUMERIC(12,4) NOT NULL,
        causa VARCHAR(50) NOT NULL,
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // desmedros_insumo
    await client.query(`
      CREATE TABLE IF NOT EXISTS desmedros_insumo (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
        insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        cantidad NUMERIC(12,4) NOT NULL,
        unidad VARCHAR(10),
        costo_unitario_snapshot NUMERIC(12,4) NOT NULL,
        perdida_total NUMERIC(12,4) NOT NULL,
        causa VARCHAR(50) NOT NULL,
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // desmedros_material
    await client.query(`
      CREATE TABLE IF NOT EXISTS desmedros_material (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
        material_id INTEGER NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
        cantidad NUMERIC(12,4) NOT NULL,
        costo_unitario_snapshot NUMERIC(12,4) NOT NULL,
        perdida_total NUMERIC(12,4) NOT NULL,
        causa VARCHAR(50) NOT NULL,
        fecha DATE NOT NULL,
        notas TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes for merma & desmedro tables
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mmi_insumo ON mediciones_merma_insumo(insumo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mmi_usuario ON mediciones_merma_insumo(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mmp_prep ON mediciones_merma_preparacion(preparacion_pred_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mmp_usuario ON mediciones_merma_preparacion(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dp_periodo ON desmedros_producto(periodo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dpr_periodo ON desmedros_preparacion(periodo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_di_periodo ON desmedros_insumo(periodo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dm_periodo ON desmedros_material(periodo_id)`);

    // Plan & trial system
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'trial'`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS max_productos INTEGER NOT NULL DEFAULT 2`);

    // Cashflow: saldo inicial por período
    await client.query(`ALTER TABLE periodos ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(12,2) DEFAULT 0`);

    // Cashflow: covering index for efficient queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_cashflow ON transacciones (periodo_id, fecha) INCLUDE (monto)`);

    // ==================== FLUJO DE CAJA V2 ====================

    // Cuentas/billeteras (caja chica, BCP, Yape, Plin, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS flujo_cuentas (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT 'efectivo',
        saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
        activa BOOLEAN NOT NULL DEFAULT true,
        orden INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Categorías del flujo de caja (árbol jerárquico)
    await client.query(`
      CREATE TABLE IF NOT EXISTS flujo_categorias (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        seccion VARCHAR(20) NOT NULL DEFAULT 'operativo',
        tipo VARCHAR(10) NOT NULL DEFAULT 'egreso',
        orden INTEGER NOT NULL DEFAULT 0,
        es_default BOOLEAN NOT NULL DEFAULT false,
        activa BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Arqueos de caja (cierre mensual)
    await client.query(`
      CREATE TABLE IF NOT EXISTS flujo_arqueos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
        fecha DATE NOT NULL,
        saldo_sistema NUMERIC(12,2) NOT NULL DEFAULT 0,
        saldo_real NUMERIC(12,2) NOT NULL DEFAULT 0,
        diferencia NUMERIC(12,2) NOT NULL DEFAULT 0,
        observaciones TEXT,
        cerrado BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Detalle de arqueo por cuenta
    await client.query(`
      CREATE TABLE IF NOT EXISTS flujo_arqueo_detalles (
        id SERIAL PRIMARY KEY,
        arqueo_id INTEGER NOT NULL REFERENCES flujo_arqueos(id) ON DELETE CASCADE,
        cuenta_id INTEGER NOT NULL REFERENCES flujo_cuentas(id) ON DELETE CASCADE,
        saldo_sistema NUMERIC(12,2) NOT NULL DEFAULT 0,
        saldo_real NUMERIC(12,2) NOT NULL DEFAULT 0,
        diferencia NUMERIC(12,2) NOT NULL DEFAULT 0
      )
    `);

    // Add flujo fields to transacciones
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES flujo_cuentas(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS flujo_categoria_id INTEGER REFERENCES flujo_categorias(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS flujo_seccion VARCHAR(20) DEFAULT 'operativo'`);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flujo_cuentas_usuario ON flujo_cuentas(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flujo_categorias_usuario ON flujo_categorias(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flujo_arqueos_periodo ON flujo_arqueos(periodo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transacciones_flujo ON transacciones(flujo_seccion, flujo_categoria_id)`);

    // ==================== FLUJO DE CAJA V3 ====================

    // Denominaciones de billetes/monedas por país
    await client.query(`
      CREATE TABLE IF NOT EXISTS denominaciones (
        id SERIAL PRIMARY KEY,
        pais_code VARCHAR(5) NOT NULL,
        valor NUMERIC(10,2) NOT NULL,
        tipo VARCHAR(10) NOT NULL DEFAULT 'billete',
        nombre VARCHAR(50) NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Seed denominations for Peru (PEN) if empty
    const denomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'PE'");
    if (parseInt(denomCount.rows[0].count) === 0) {
      const peruDenoms = [
        // Billetes
        { valor: 200, tipo: 'billete', nombre: 'S/ 200', orden: 1 },
        { valor: 100, tipo: 'billete', nombre: 'S/ 100', orden: 2 },
        { valor: 50, tipo: 'billete', nombre: 'S/ 50', orden: 3 },
        { valor: 20, tipo: 'billete', nombre: 'S/ 20', orden: 4 },
        { valor: 10, tipo: 'billete', nombre: 'S/ 10', orden: 5 },
        // Monedas
        { valor: 5, tipo: 'moneda', nombre: 'S/ 5', orden: 10 },
        { valor: 2, tipo: 'moneda', nombre: 'S/ 2', orden: 11 },
        { valor: 1, tipo: 'moneda', nombre: 'S/ 1', orden: 12 },
        { valor: 0.50, tipo: 'moneda', nombre: 'S/ 0.50', orden: 13 },
        { valor: 0.20, tipo: 'moneda', nombre: 'S/ 0.20', orden: 14 },
        { valor: 0.10, tipo: 'moneda', nombre: 'S/ 0.10', orden: 15 },
      ];
      for (const d of peruDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('PE', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Mexico (MXN)
    const mxDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'MX'");
    if (parseInt(mxDenomCount.rows[0].count) === 0) {
      const mxDenoms = [
        { valor: 1000, tipo: 'billete', nombre: '$1,000', orden: 1 },
        { valor: 500, tipo: 'billete', nombre: '$500', orden: 2 },
        { valor: 200, tipo: 'billete', nombre: '$200', orden: 3 },
        { valor: 100, tipo: 'billete', nombre: '$100', orden: 4 },
        { valor: 50, tipo: 'billete', nombre: '$50', orden: 5 },
        { valor: 20, tipo: 'billete', nombre: '$20', orden: 6 },
        { valor: 10, tipo: 'moneda', nombre: '$10', orden: 10 },
        { valor: 5, tipo: 'moneda', nombre: '$5', orden: 11 },
        { valor: 2, tipo: 'moneda', nombre: '$2', orden: 12 },
        { valor: 1, tipo: 'moneda', nombre: '$1', orden: 13 },
        { valor: 0.50, tipo: 'moneda', nombre: '$0.50', orden: 14 },
      ];
      for (const d of mxDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('MX', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Colombia (COP)
    const coDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'CO'");
    if (parseInt(coDenomCount.rows[0].count) === 0) {
      const coDenoms = [
        { valor: 100000, tipo: 'billete', nombre: '$100.000', orden: 1 },
        { valor: 50000, tipo: 'billete', nombre: '$50.000', orden: 2 },
        { valor: 20000, tipo: 'billete', nombre: '$20.000', orden: 3 },
        { valor: 10000, tipo: 'billete', nombre: '$10.000', orden: 4 },
        { valor: 5000, tipo: 'billete', nombre: '$5.000', orden: 5 },
        { valor: 2000, tipo: 'billete', nombre: '$2.000', orden: 6 },
        { valor: 1000, tipo: 'moneda', nombre: '$1.000', orden: 10 },
        { valor: 500, tipo: 'moneda', nombre: '$500', orden: 11 },
        { valor: 200, tipo: 'moneda', nombre: '$200', orden: 12 },
        { valor: 100, tipo: 'moneda', nombre: '$100', orden: 13 },
        { valor: 50, tipo: 'moneda', nombre: '$50', orden: 14 },
      ];
      for (const d of coDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('CO', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Argentina (ARS)
    const arDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'AR'");
    if (parseInt(arDenomCount.rows[0].count) === 0) {
      const arDenoms = [
        { valor: 10000, tipo: 'billete', nombre: '$10.000', orden: 1 },
        { valor: 5000, tipo: 'billete', nombre: '$5.000', orden: 2 },
        { valor: 2000, tipo: 'billete', nombre: '$2.000', orden: 3 },
        { valor: 1000, tipo: 'billete', nombre: '$1.000', orden: 4 },
        { valor: 500, tipo: 'billete', nombre: '$500', orden: 5 },
        { valor: 200, tipo: 'billete', nombre: '$200', orden: 6 },
        { valor: 100, tipo: 'billete', nombre: '$100', orden: 7 },
        { valor: 50, tipo: 'moneda', nombre: '$50', orden: 10 },
        { valor: 25, tipo: 'moneda', nombre: '$25', orden: 11 },
        { valor: 10, tipo: 'moneda', nombre: '$10', orden: 12 },
        { valor: 5, tipo: 'moneda', nombre: '$5', orden: 13 },
        { valor: 2, tipo: 'moneda', nombre: '$2', orden: 14 },
        { valor: 1, tipo: 'moneda', nombre: '$1', orden: 15 },
      ];
      for (const d of arDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('AR', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Bolivia (BOB)
    const boDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'BO'");
    if (parseInt(boDenomCount.rows[0].count) === 0) {
      const boDenoms = [
        { valor: 200, tipo: 'billete', nombre: 'Bs 200', orden: 1 },
        { valor: 100, tipo: 'billete', nombre: 'Bs 100', orden: 2 },
        { valor: 50, tipo: 'billete', nombre: 'Bs 50', orden: 3 },
        { valor: 20, tipo: 'billete', nombre: 'Bs 20', orden: 4 },
        { valor: 10, tipo: 'billete', nombre: 'Bs 10', orden: 5 },
        { valor: 5, tipo: 'moneda', nombre: 'Bs 5', orden: 10 },
        { valor: 2, tipo: 'moneda', nombre: 'Bs 2', orden: 11 },
        { valor: 1, tipo: 'moneda', nombre: 'Bs 1', orden: 12 },
        { valor: 0.50, tipo: 'moneda', nombre: 'Bs 0.50', orden: 13 },
        { valor: 0.20, tipo: 'moneda', nombre: 'Bs 0.20', orden: 14 },
        { valor: 0.10, tipo: 'moneda', nombre: 'Bs 0.10', orden: 15 },
      ];
      for (const d of boDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('BO', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Brasil (BRL)
    const brDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'BR'");
    if (parseInt(brDenomCount.rows[0].count) === 0) {
      const brDenoms = [
        { valor: 200, tipo: 'billete', nombre: 'R$ 200', orden: 1 },
        { valor: 100, tipo: 'billete', nombre: 'R$ 100', orden: 2 },
        { valor: 50, tipo: 'billete', nombre: 'R$ 50', orden: 3 },
        { valor: 20, tipo: 'billete', nombre: 'R$ 20', orden: 4 },
        { valor: 10, tipo: 'billete', nombre: 'R$ 10', orden: 5 },
        { valor: 5, tipo: 'billete', nombre: 'R$ 5', orden: 6 },
        { valor: 2, tipo: 'billete', nombre: 'R$ 2', orden: 7 },
        { valor: 1, tipo: 'moneda', nombre: 'R$ 1', orden: 10 },
        { valor: 0.50, tipo: 'moneda', nombre: 'R$ 0.50', orden: 11 },
        { valor: 0.25, tipo: 'moneda', nombre: 'R$ 0.25', orden: 12 },
        { valor: 0.10, tipo: 'moneda', nombre: 'R$ 0.10', orden: 13 },
        { valor: 0.05, tipo: 'moneda', nombre: 'R$ 0.05', orden: 14 },
      ];
      for (const d of brDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('BR', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Chile (CLP)
    const clDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'CL'");
    if (parseInt(clDenomCount.rows[0].count) === 0) {
      const clDenoms = [
        { valor: 20000, tipo: 'billete', nombre: '$20.000', orden: 1 },
        { valor: 10000, tipo: 'billete', nombre: '$10.000', orden: 2 },
        { valor: 5000, tipo: 'billete', nombre: '$5.000', orden: 3 },
        { valor: 2000, tipo: 'billete', nombre: '$2.000', orden: 4 },
        { valor: 1000, tipo: 'billete', nombre: '$1.000', orden: 5 },
        { valor: 500, tipo: 'moneda', nombre: '$500', orden: 10 },
        { valor: 100, tipo: 'moneda', nombre: '$100', orden: 11 },
        { valor: 50, tipo: 'moneda', nombre: '$50', orden: 12 },
        { valor: 10, tipo: 'moneda', nombre: '$10', orden: 13 },
      ];
      for (const d of clDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('CL', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Costa Rica (CRC)
    const crDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'CR'");
    if (parseInt(crDenomCount.rows[0].count) === 0) {
      const crDenoms = [
        { valor: 50000, tipo: 'billete', nombre: '₡50.000', orden: 1 },
        { valor: 20000, tipo: 'billete', nombre: '₡20.000', orden: 2 },
        { valor: 10000, tipo: 'billete', nombre: '₡10.000', orden: 3 },
        { valor: 5000, tipo: 'billete', nombre: '₡5.000', orden: 4 },
        { valor: 2000, tipo: 'billete', nombre: '₡2.000', orden: 5 },
        { valor: 1000, tipo: 'billete', nombre: '₡1.000', orden: 6 },
        { valor: 500, tipo: 'moneda', nombre: '₡500', orden: 10 },
        { valor: 100, tipo: 'moneda', nombre: '₡100', orden: 11 },
        { valor: 50, tipo: 'moneda', nombre: '₡50', orden: 12 },
        { valor: 25, tipo: 'moneda', nombre: '₡25', orden: 13 },
        { valor: 10, tipo: 'moneda', nombre: '₡10', orden: 14 },
        { valor: 5, tipo: 'moneda', nombre: '₡5', orden: 15 },
      ];
      for (const d of crDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('CR', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Ecuador (USD)
    const ecDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'EC'");
    if (parseInt(ecDenomCount.rows[0].count) === 0) {
      const ecDenoms = [
        { valor: 100, tipo: 'billete', nombre: '$100', orden: 1 },
        { valor: 50, tipo: 'billete', nombre: '$50', orden: 2 },
        { valor: 20, tipo: 'billete', nombre: '$20', orden: 3 },
        { valor: 10, tipo: 'billete', nombre: '$10', orden: 4 },
        { valor: 5, tipo: 'billete', nombre: '$5', orden: 5 },
        { valor: 1, tipo: 'billete', nombre: '$1', orden: 6 },
        { valor: 0.50, tipo: 'moneda', nombre: '$0.50', orden: 10 },
        { valor: 0.25, tipo: 'moneda', nombre: '$0.25', orden: 11 },
        { valor: 0.10, tipo: 'moneda', nombre: '$0.10', orden: 12 },
        { valor: 0.05, tipo: 'moneda', nombre: '$0.05', orden: 13 },
        { valor: 0.01, tipo: 'moneda', nombre: '$0.01', orden: 14 },
      ];
      for (const d of ecDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('EC', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for El Salvador (USD)
    const svDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'SV'");
    if (parseInt(svDenomCount.rows[0].count) === 0) {
      const svDenoms = [
        { valor: 100, tipo: 'billete', nombre: '$100', orden: 1 },
        { valor: 50, tipo: 'billete', nombre: '$50', orden: 2 },
        { valor: 20, tipo: 'billete', nombre: '$20', orden: 3 },
        { valor: 10, tipo: 'billete', nombre: '$10', orden: 4 },
        { valor: 5, tipo: 'billete', nombre: '$5', orden: 5 },
        { valor: 1, tipo: 'billete', nombre: '$1', orden: 6 },
        { valor: 0.50, tipo: 'moneda', nombre: '$0.50', orden: 10 },
        { valor: 0.25, tipo: 'moneda', nombre: '$0.25', orden: 11 },
        { valor: 0.10, tipo: 'moneda', nombre: '$0.10', orden: 12 },
        { valor: 0.05, tipo: 'moneda', nombre: '$0.05', orden: 13 },
        { valor: 0.01, tipo: 'moneda', nombre: '$0.01', orden: 14 },
      ];
      for (const d of svDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('SV', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Guatemala (GTQ)
    const gtDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'GT'");
    if (parseInt(gtDenomCount.rows[0].count) === 0) {
      const gtDenoms = [
        { valor: 200, tipo: 'billete', nombre: 'Q200', orden: 1 },
        { valor: 100, tipo: 'billete', nombre: 'Q100', orden: 2 },
        { valor: 50, tipo: 'billete', nombre: 'Q50', orden: 3 },
        { valor: 20, tipo: 'billete', nombre: 'Q20', orden: 4 },
        { valor: 10, tipo: 'billete', nombre: 'Q10', orden: 5 },
        { valor: 5, tipo: 'billete', nombre: 'Q5', orden: 6 },
        { valor: 1, tipo: 'billete', nombre: 'Q1', orden: 7 },
        { valor: 1, tipo: 'moneda', nombre: 'Q1', orden: 10 },
        { valor: 0.50, tipo: 'moneda', nombre: 'Q0.50', orden: 11 },
        { valor: 0.25, tipo: 'moneda', nombre: 'Q0.25', orden: 12 },
        { valor: 0.10, tipo: 'moneda', nombre: 'Q0.10', orden: 13 },
        { valor: 0.05, tipo: 'moneda', nombre: 'Q0.05', orden: 14 },
        { valor: 0.01, tipo: 'moneda', nombre: 'Q0.01', orden: 15 },
      ];
      for (const d of gtDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('GT', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Honduras (HNL)
    const hnDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'HN'");
    if (parseInt(hnDenomCount.rows[0].count) === 0) {
      const hnDenoms = [
        { valor: 500, tipo: 'billete', nombre: 'L500', orden: 1 },
        { valor: 200, tipo: 'billete', nombre: 'L200', orden: 2 },
        { valor: 100, tipo: 'billete', nombre: 'L100', orden: 3 },
        { valor: 50, tipo: 'billete', nombre: 'L50', orden: 4 },
        { valor: 20, tipo: 'billete', nombre: 'L20', orden: 5 },
        { valor: 10, tipo: 'billete', nombre: 'L10', orden: 6 },
        { valor: 5, tipo: 'billete', nombre: 'L5', orden: 7 },
        { valor: 2, tipo: 'billete', nombre: 'L2', orden: 8 },
        { valor: 1, tipo: 'billete', nombre: 'L1', orden: 9 },
        { valor: 0.50, tipo: 'moneda', nombre: 'L0.50', orden: 10 },
        { valor: 0.20, tipo: 'moneda', nombre: 'L0.20', orden: 11 },
        { valor: 0.10, tipo: 'moneda', nombre: 'L0.10', orden: 12 },
        { valor: 0.05, tipo: 'moneda', nombre: 'L0.05', orden: 13 },
      ];
      for (const d of hnDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('HN', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Nicaragua (NIO)
    const niDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'NI'");
    if (parseInt(niDenomCount.rows[0].count) === 0) {
      const niDenoms = [
        { valor: 1000, tipo: 'billete', nombre: 'C$1.000', orden: 1 },
        { valor: 500, tipo: 'billete', nombre: 'C$500', orden: 2 },
        { valor: 200, tipo: 'billete', nombre: 'C$200', orden: 3 },
        { valor: 100, tipo: 'billete', nombre: 'C$100', orden: 4 },
        { valor: 50, tipo: 'billete', nombre: 'C$50', orden: 5 },
        { valor: 20, tipo: 'billete', nombre: 'C$20', orden: 6 },
        { valor: 10, tipo: 'billete', nombre: 'C$10', orden: 7 },
        { valor: 5, tipo: 'moneda', nombre: 'C$5', orden: 10 },
        { valor: 1, tipo: 'moneda', nombre: 'C$1', orden: 11 },
        { valor: 0.50, tipo: 'moneda', nombre: 'C$0.50', orden: 12 },
        { valor: 0.25, tipo: 'moneda', nombre: 'C$0.25', orden: 13 },
        { valor: 0.10, tipo: 'moneda', nombre: 'C$0.10', orden: 14 },
      ];
      for (const d of niDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('NI', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Panama (USD)
    const paDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'PA'");
    if (parseInt(paDenomCount.rows[0].count) === 0) {
      const paDenoms = [
        { valor: 100, tipo: 'billete', nombre: '$100', orden: 1 },
        { valor: 50, tipo: 'billete', nombre: '$50', orden: 2 },
        { valor: 20, tipo: 'billete', nombre: '$20', orden: 3 },
        { valor: 10, tipo: 'billete', nombre: '$10', orden: 4 },
        { valor: 5, tipo: 'billete', nombre: '$5', orden: 5 },
        { valor: 1, tipo: 'billete', nombre: '$1', orden: 6 },
        { valor: 0.50, tipo: 'moneda', nombre: '$0.50', orden: 10 },
        { valor: 0.25, tipo: 'moneda', nombre: '$0.25', orden: 11 },
        { valor: 0.10, tipo: 'moneda', nombre: '$0.10', orden: 12 },
        { valor: 0.05, tipo: 'moneda', nombre: '$0.05', orden: 13 },
        { valor: 0.01, tipo: 'moneda', nombre: '$0.01', orden: 14 },
      ];
      for (const d of paDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('PA', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Paraguay (PYG)
    const pyDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'PY'");
    if (parseInt(pyDenomCount.rows[0].count) === 0) {
      const pyDenoms = [
        { valor: 100000, tipo: 'billete', nombre: '₲100.000', orden: 1 },
        { valor: 50000, tipo: 'billete', nombre: '₲50.000', orden: 2 },
        { valor: 20000, tipo: 'billete', nombre: '₲20.000', orden: 3 },
        { valor: 10000, tipo: 'billete', nombre: '₲10.000', orden: 4 },
        { valor: 5000, tipo: 'billete', nombre: '₲5.000', orden: 5 },
        { valor: 2000, tipo: 'billete', nombre: '₲2.000', orden: 6 },
        { valor: 1000, tipo: 'moneda', nombre: '₲1.000', orden: 10 },
        { valor: 500, tipo: 'moneda', nombre: '₲500', orden: 11 },
        { valor: 100, tipo: 'moneda', nombre: '₲100', orden: 12 },
        { valor: 50, tipo: 'moneda', nombre: '₲50', orden: 13 },
      ];
      for (const d of pyDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('PY', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Rep. Dominicana (DOP)
    const doDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'DO'");
    if (parseInt(doDenomCount.rows[0].count) === 0) {
      const doDenoms = [
        { valor: 2000, tipo: 'billete', nombre: 'RD$2.000', orden: 1 },
        { valor: 1000, tipo: 'billete', nombre: 'RD$1.000', orden: 2 },
        { valor: 500, tipo: 'billete', nombre: 'RD$500', orden: 3 },
        { valor: 200, tipo: 'billete', nombre: 'RD$200', orden: 4 },
        { valor: 100, tipo: 'billete', nombre: 'RD$100', orden: 5 },
        { valor: 50, tipo: 'billete', nombre: 'RD$50', orden: 6 },
        { valor: 25, tipo: 'moneda', nombre: 'RD$25', orden: 10 },
        { valor: 10, tipo: 'moneda', nombre: 'RD$10', orden: 11 },
        { valor: 5, tipo: 'moneda', nombre: 'RD$5', orden: 12 },
        { valor: 1, tipo: 'moneda', nombre: 'RD$1', orden: 13 },
      ];
      for (const d of doDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('DO', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Uruguay (UYU)
    const uyDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'UY'");
    if (parseInt(uyDenomCount.rows[0].count) === 0) {
      const uyDenoms = [
        { valor: 2000, tipo: 'billete', nombre: '$U 2.000', orden: 1 },
        { valor: 1000, tipo: 'billete', nombre: '$U 1.000', orden: 2 },
        { valor: 500, tipo: 'billete', nombre: '$U 500', orden: 3 },
        { valor: 200, tipo: 'billete', nombre: '$U 200', orden: 4 },
        { valor: 100, tipo: 'billete', nombre: '$U 100', orden: 5 },
        { valor: 50, tipo: 'billete', nombre: '$U 50', orden: 6 },
        { valor: 20, tipo: 'billete', nombre: '$U 20', orden: 7 },
        { valor: 50, tipo: 'moneda', nombre: '$U 50', orden: 10 },
        { valor: 10, tipo: 'moneda', nombre: '$U 10', orden: 11 },
        { valor: 5, tipo: 'moneda', nombre: '$U 5', orden: 12 },
        { valor: 2, tipo: 'moneda', nombre: '$U 2', orden: 13 },
        { valor: 1, tipo: 'moneda', nombre: '$U 1', orden: 14 },
      ];
      for (const d of uyDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('UY', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Seed for Venezuela (VES)
    const veDenomCount = await client.query("SELECT COUNT(*) FROM denominaciones WHERE pais_code = 'VE'");
    if (parseInt(veDenomCount.rows[0].count) === 0) {
      const veDenoms = [
        { valor: 100, tipo: 'billete', nombre: 'Bs.D 100', orden: 1 },
        { valor: 50, tipo: 'billete', nombre: 'Bs.D 50', orden: 2 },
        { valor: 20, tipo: 'billete', nombre: 'Bs.D 20', orden: 3 },
        { valor: 10, tipo: 'billete', nombre: 'Bs.D 10', orden: 4 },
        { valor: 5, tipo: 'billete', nombre: 'Bs.D 5', orden: 5 },
        { valor: 1, tipo: 'moneda', nombre: 'Bs.D 1', orden: 10 },
        { valor: 0.50, tipo: 'moneda', nombre: 'Bs.D 0.50', orden: 11 },
        { valor: 0.25, tipo: 'moneda', nombre: 'Bs.D 0.25', orden: 12 },
      ];
      for (const d of veDenoms) {
        await client.query(
          "INSERT INTO denominaciones (pais_code, valor, tipo, nombre, orden) VALUES ('VE', $1, $2, $3, $4)",
          [d.valor, d.tipo, d.nombre, d.orden]
        );
      }
    }

    // Update flujo_cuentas with new fields
    await client.query(`ALTER TABLE flujo_cuentas ADD COLUMN IF NOT EXISTS fondo_caja NUMERIC(12,2) DEFAULT 0`);
    await client.query(`ALTER TABLE flujo_cuentas ADD COLUMN IF NOT EXISTS alerta_saldo_minimo NUMERIC(12,2)`);
    await client.query(`ALTER TABLE flujo_cuentas ADD COLUMN IF NOT EXISTS ultimo_arqueo DATE`);

    // Update flujo_arqueos for daily support + desglose
    await client.query(`ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS desglose JSONB`);
    await client.query(`ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS fondo_inicial NUMERIC(12,2) DEFAULT 0`);
    await client.query(`ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS responsable VARCHAR(100)`);
    await client.query(`ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) DEFAULT 'diario'`);

    // Transferencias entre cuentas
    await client.query(`
      CREATE TABLE IF NOT EXISTS flujo_transferencias (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        cuenta_origen_id INTEGER NOT NULL REFERENCES flujo_cuentas(id),
        cuenta_destino_id INTEGER NOT NULL REFERENCES flujo_cuentas(id),
        monto NUMERIC(12,2) NOT NULL,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        descripcion VARCHAR(255),
        referencia VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_denominaciones_pais ON denominaciones(pais_code, orden)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flujo_transferencias_usuario ON flujo_transferencias(usuario_id)`);

    // Fix legacy category names (payment method → concept)
    await client.query(`UPDATE flujo_categorias SET nombre = 'Ventas' WHERE nombre = 'Ventas en efectivo'`);
    await client.query(`UPDATE flujo_categorias SET nombre = 'Catering / Pedidos especiales' WHERE nombre = 'Ventas Yape/Plin'`);
    await client.query(`UPDATE flujo_categorias SET nombre = 'Delivery' WHERE nombre = 'Ventas transferencia'`);
    await client.query(`UPDATE flujo_categorias SET nombre = 'Otros ingresos operativos' WHERE nombre = 'Ventas con tarjeta'`);

    // ==================== FACTURACION ELECTRONICA ====================

    // Configuracion de facturacion por empresa
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturacion_config (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        apisperu_company_id VARCHAR(100),
        environment VARCHAR(20) DEFAULT 'beta',
        habilitado BOOLEAN DEFAULT false,
        certificado_pem TEXT,
        certificado_subido BOOLEAN DEFAULT false,
        certificado_vence DATE,
        serie_factura VARCHAR(10) DEFAULT 'F001',
        serie_boleta VARCHAR(10) DEFAULT 'B001',
        serie_nota_credito VARCHAR(10) DEFAULT 'FC01',
        serie_nota_debito VARCHAR(10) DEFAULT 'FD01',
        correlativo_factura INTEGER DEFAULT 0,
        correlativo_boleta INTEGER DEFAULT 0,
        correlativo_nc INTEGER DEFAULT 0,
        correlativo_nd INTEGER DEFAULT 0,
        direccion_fiscal TEXT,
        departamento VARCHAR(50),
        provincia VARCHAR(50),
        distrito VARCHAR(50),
        ubigeo VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Comprobantes emitidos
    await client.query(`
      CREATE TABLE IF NOT EXISTS comprobantes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        venta_id INTEGER,
        transaccion_id INTEGER,
        tipo_doc VARCHAR(5) NOT NULL,
        serie VARCHAR(10) NOT NULL,
        correlativo VARCHAR(20) NOT NULL,
        fecha_emision TIMESTAMPTZ NOT NULL,
        cliente_tipo_doc VARCHAR(5),
        cliente_num_doc VARCHAR(20),
        cliente_razon_social VARCHAR(200),
        cliente_direccion TEXT,
        mto_oper_gravadas NUMERIC(12,2),
        mto_igv NUMERIC(12,2),
        mto_total NUMERIC(12,2),
        moneda VARCHAR(5) DEFAULT 'PEN',
        sunat_success BOOLEAN,
        sunat_code VARCHAR(20),
        sunat_message TEXT,
        sunat_xml TEXT,
        sunat_cdr TEXT,
        sunat_hash VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'emitido',
        detalle_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Catalogo de clientes (compradores)
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo_doc VARCHAR(5) NOT NULL DEFAULT '1',
        num_doc VARCHAR(20) NOT NULL,
        razon_social VARCHAR(200),
        direccion TEXT,
        email VARCHAR(150),
        telefono VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add unique constraint on clientes if not exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_usuario_doc_unique') THEN
          ALTER TABLE clientes ADD CONSTRAINT clientes_usuario_doc_unique UNIQUE (usuario_id, num_doc);
        END IF;
      END $$;
    `);

    // Direccion fiscal en usuarios
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS departamento VARCHAR(50)`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS provincia VARCHAR(50)`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS distrito VARCHAR(50)`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10)`);

    // Facturado flag en ventas y transacciones
    await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprobante_id INTEGER`);
    await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS comprobante_id INTEGER`);
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false`);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comprobantes_usuario ON comprobantes(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comprobantes_venta ON comprobantes(venta_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clientes_doc ON clientes(usuario_id, num_doc)`);

    // Permisos: add facturacion
    await client.query(`
      ALTER TABLE usuarios
        ALTER COLUMN permisos SET DEFAULT '["dashboard","cotizador","insumos","materiales","preparaciones","empaques","proyeccion","pl","perdidas","facturacion"]'::jsonb
    `);

    // ==================== GIRO DE NEGOCIO ====================

    await client.query(`
      CREATE TABLE IF NOT EXISTS giros_negocio (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(30) NOT NULL UNIQUE,
        sector VARCHAR(50) NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        icono VARCHAR(30),
        terminos JSONB NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      )
    `);

    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS giro_negocio_id INTEGER REFERENCES giros_negocio(id)`);

    // Seed giros if empty
    const girosCount = await client.query('SELECT COUNT(*) FROM giros_negocio');
    if (parseInt(girosCount.rows[0].count) === 0) {
      const giros = [
        // Alimentos y Bebidas
        { codigo: 'panaderia', sector: 'Alimentos y Bebidas', nombre: 'Panadería y Pastelería', icono: 'cake', orden: 1,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Productos', materiales: 'Empaque', ficha_tecnica: 'Receta estándar', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'restaurante', sector: 'Alimentos y Bebidas', nombre: 'Restaurante / Cocina', icono: 'utensils', orden: 2,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Platos', materiales: 'Descartables', ficha_tecnica: 'Receta estándar', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'catering', sector: 'Alimentos y Bebidas', nombre: 'Catering y Eventos', icono: 'party-popper', orden: 3,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Servicios', materiales: 'Montaje', ficha_tecnica: 'Costeo por evento', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'food_truck', sector: 'Alimentos y Bebidas', nombre: 'Food Truck / Comida rápida', icono: 'truck', orden: 4,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Ítems del menú', materiales: 'Envases', ficha_tecnica: 'Receta estándar', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'heladeria', sector: 'Alimentos y Bebidas', nombre: 'Heladería', icono: 'ice-cream-cone', orden: 5,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Fórmulas', productos: 'Sabores', materiales: 'Envases', ficha_tecnica: 'Fórmula', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Batch', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'chocolateria', sector: 'Alimentos y Bebidas', nombre: 'Chocolatería / Confitería', icono: 'candy', orden: 6,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Bombones', materiales: 'Presentación', ficha_tecnica: 'Fórmula', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'cerveceria', sector: 'Alimentos y Bebidas', nombre: 'Cervecería Artesanal', icono: 'beer', orden: 7,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas de cocción', productos: 'Estilos', materiales: 'Botellas y etiquetas', ficha_tecnica: 'Receta cervecera', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Batch', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'cafeteria', sector: 'Alimentos y Bebidas', nombre: 'Cafetería de Especialidad', icono: 'coffee', orden: 8,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Métodos', productos: 'Bebidas', materiales: 'Vasos y mangas', ficha_tecnica: 'Receta de barra', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Métodos base' }},
        { codigo: 'bebidas', sector: 'Alimentos y Bebidas', nombre: 'Jugos y Bebidas', icono: 'glass-water', orden: 9,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Recetas', productos: 'Bebidas', materiales: 'Vasos y envases', ficha_tecnica: 'Receta', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'alimentos_proc', sector: 'Alimentos y Bebidas', nombre: 'Procesadora de Alimentos', icono: 'factory', orden: 10,
          terminos: { insumos: 'Materia prima', preparaciones: 'Fórmulas', productos: 'Producto terminado', materiales: 'Empaque', ficha_tecnica: 'Ficha técnica', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},

        // Cosméticos y Cuidado Personal
        { codigo: 'jabones', sector: 'Cosméticos y Cuidado Personal', nombre: 'Jabones Artesanales', icono: 'droplets', orden: 11,
          terminos: { insumos: 'Materias primas', preparaciones: 'Fórmulas', productos: 'Jabones', materiales: 'Empaque', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'cosmeticos', sector: 'Cosméticos y Cuidado Personal', nombre: 'Cremas y Cosméticos', icono: 'sparkles', orden: 12,
          terminos: { insumos: 'Materias primas', preparaciones: 'Fórmulas', productos: 'Productos', materiales: 'Envases', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'perfumeria', sector: 'Cosméticos y Cuidado Personal', nombre: 'Perfumería', icono: 'spray-can', orden: 13,
          terminos: { insumos: 'Esencias', preparaciones: 'Fórmulas', productos: 'Fragancias', materiales: 'Frascos', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},

        // Artesanías
        { codigo: 'velas', sector: 'Artesanías', nombre: 'Velas Aromáticas', icono: 'flame', orden: 14,
          terminos: { insumos: 'Materias primas', preparaciones: 'Fórmulas', productos: 'Velas', materiales: 'Recipientes', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'joyeria', sector: 'Artesanías', nombre: 'Joyería y Bisutería', icono: 'gem', orden: 15,
          terminos: { insumos: 'Materiales', preparaciones: 'Diseños', productos: 'Piezas', materiales: 'Presentación', ficha_tecnica: 'Ficha de diseño', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Diseños base' }},
        { codigo: 'ceramica', sector: 'Artesanías', nombre: 'Cerámica', icono: 'amphora', orden: 16,
          terminos: { insumos: 'Materiales', preparaciones: 'Procesos', productos: 'Piezas', materiales: 'Empaque', ficha_tecnica: 'Ficha de pieza', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Hornada', rendimiento: 'Rendimiento', prep_pred: 'Procesos base' }},
        { codigo: 'cuero', sector: 'Artesanías', nombre: 'Marroquinería / Cuero', icono: 'briefcase', orden: 17,
          terminos: { insumos: 'Materiales', preparaciones: 'Patronaje', productos: 'Artículos', materiales: 'Presentación', ficha_tecnica: 'Ficha de producto', merma: 'Retazo', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Patrones base' }},
        { codigo: 'madera', sector: 'Artesanías', nombre: 'Carpintería / Madera', icono: 'trees', orden: 18,
          terminos: { insumos: 'Materiales', preparaciones: 'Planos', productos: 'Muebles y piezas', materiales: 'Embalaje', ficha_tecnica: 'Plano de producción', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Planos base' }},

        // Limpieza
        { codigo: 'limpieza', sector: 'Productos de Limpieza', nombre: 'Productos de Limpieza', icono: 'spray-can', orden: 19,
          terminos: { insumos: 'Químicos', preparaciones: 'Fórmulas', productos: 'Productos', materiales: 'Envases', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},

        // Agroindustria
        { codigo: 'conservas', sector: 'Agroindustria', nombre: 'Mermeladas y Conservas', icono: 'apple', orden: 20,
          terminos: { insumos: 'Materia prima', preparaciones: 'Recetas', productos: 'Conservas', materiales: 'Frascos y etiquetas', ficha_tecnica: 'Receta', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Recetas base' }},
        { codigo: 'salsas', sector: 'Agroindustria', nombre: 'Salsas y Aderezos', icono: 'flame', orden: 21,
          terminos: { insumos: 'Materia prima', preparaciones: 'Fórmulas', productos: 'Salsas', materiales: 'Botellas', ficha_tecnica: 'Fórmula', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'cafe_cacao', sector: 'Agroindustria', nombre: 'Café y Cacao', icono: 'coffee', orden: 22,
          terminos: { insumos: 'Materia prima', preparaciones: 'Procesos', productos: 'Producto terminado', materiales: 'Bolsas y etiquetas', ficha_tecnica: 'Perfil de tueste', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Procesos base' }},

        // Textil y Moda
        { codigo: 'confeccion', sector: 'Textil y Moda', nombre: 'Confección / Taller', icono: 'scissors', orden: 23,
          terminos: { insumos: 'Telas e hilos', preparaciones: 'Patronaje', productos: 'Prendas', materiales: 'Presentación', ficha_tecnica: 'Ficha de prenda', merma: 'Retazo', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Patrones base' }},
        { codigo: 'serigrafia', sector: 'Textil y Moda', nombre: 'Serigrafía / Estampado', icono: 'printer', orden: 24,
          terminos: { insumos: 'Tintas y blanks', preparaciones: 'Procesos', productos: 'Artículos', materiales: 'Empaque', ficha_tecnica: 'Ficha de diseño', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Procesos base' }},
        { codigo: 'tejido', sector: 'Textil y Moda', nombre: 'Tejido y Crochet', icono: 'ribbon', orden: 25,
          terminos: { insumos: 'Hilos y lanas', preparaciones: 'Patrones', productos: 'Piezas', materiales: 'Empaque', ficha_tecnica: 'Patrón', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Patrones base' }},

        // Salud y Suplementos
        { codigo: 'suplementos', sector: 'Salud y Suplementos', nombre: 'Suplementos Naturales', icono: 'pill', orden: 26,
          terminos: { insumos: 'Extractos', preparaciones: 'Fórmulas', productos: 'Productos', materiales: 'Frascos', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},
        { codigo: 'herbolaria', sector: 'Salud y Suplementos', nombre: 'Herbolaria', icono: 'leaf', orden: 27,
          terminos: { insumos: 'Hierbas', preparaciones: 'Mezclas', productos: 'Infusiones', materiales: 'Empaque', ficha_tecnica: 'Fórmula', merma: 'Desperdicio', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Mezclas base' }},

        // Mascotas
        { codigo: 'pet_food', sector: 'Mascotas', nombre: 'Alimento para Mascotas', icono: 'paw-print', orden: 28,
          terminos: { insumos: 'Ingredientes', preparaciones: 'Fórmulas', productos: 'Alimentos', materiales: 'Empaque', ficha_tecnica: 'Fórmula nutricional', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Lote', rendimiento: 'Rendimiento', prep_pred: 'Fórmulas base' }},

        // Otro
        { codigo: 'otro', sector: 'Otro', nombre: 'Otro / General', icono: 'box', orden: 99,
          terminos: { insumos: 'Insumos', preparaciones: 'Preparaciones', productos: 'Productos', materiales: 'Materiales', ficha_tecnica: 'Ficha técnica', merma: 'Merma', desmedro: 'Desmedro', tanda: 'Tanda', rendimiento: 'Rendimiento', prep_pred: 'Prep. predeterminadas' }},
      ];

      for (const g of giros) {
        await client.query(
          'INSERT INTO giros_negocio (codigo, sector, nombre, icono, terminos, orden) VALUES ($1, $2, $3, $4, $5, $6)',
          [g.codigo, g.sector, g.nombre, g.icono, JSON.stringify(g.terminos), g.orden]
        );
      }
    }

    // ==================== AUDIT TRAIL ====================

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL DEFAULT 0,
        usuario_nombre VARCHAR(200),
        entidad VARCHAR(50) NOT NULL,
        entidad_id INTEGER,
        accion VARCHAR(20) NOT NULL,
        descripcion TEXT,
        cambios_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log(entidad, entidad_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_fecha ON audit_log(created_at DESC)`);

    // created_by / updated_by on key tables
    await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_by INTEGER`);
    await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS updated_by INTEGER`);
    await client.query(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE insumos ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE materiales ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE flujo_arqueos ADD COLUMN IF NOT EXISTS created_by INTEGER`);

    console.log('[migrate] OK');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
