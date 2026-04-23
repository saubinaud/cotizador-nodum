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

    console.log('[migrate] OK');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
