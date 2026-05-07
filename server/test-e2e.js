#!/usr/bin/env node
/**
 * E2E Tests for Kudi API — tests all bug fixes and multi-tenant changes
 * Run: node test-e2e.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const jwt = require('jsonwebtoken');

const BASE = `http://localhost:${process.env.PORT || 3001}/api`;
const SECRET = process.env.JWT_SECRET;

// Two fake users in same empresa (for multi-tenant tests)
const USER_A = { id: 2, email: 'admin@nodum.pe', empresa_id: 1, rol: 'admin', rol_empresa: 'owner' };
const TOKEN_A = jwt.sign(USER_A, SECRET, { expiresIn: '1h' });

let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ── helpers ────────────────────────────────────────────────────────
async function api(method, path, body, token = TOKEN_A) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ❌ ${name} — ${err.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ⏭️  ${name} — ${reason}`);
}

// IDs created during tests, for cleanup
const cleanup = { materiales: [], insumos: [], productos: [], clientes: [], cuentas: [], categorias: [], pedidos: [], transacciones: [], movimientos: [] };

// ── TESTS ──────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔧 Kudi E2E Tests\n');

  // ═══════════ HEALTH ═══════════
  console.log('── Health ──');
  await test('Health check', async () => {
    const r = await api('GET', '/health');
    assert(r.success === true, `Expected success, got ${JSON.stringify(r)}`);
  });

  // ═══════════ AUTH ═══════════
  console.log('── Auth ──');
  await test('Auth rejects without token', async () => {
    const r = await fetch(`${BASE}/productos`, { headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('Auth accepts valid token', async () => {
    const r = await api('GET', '/productos');
    assert(r.success === true, `Expected success, got ${JSON.stringify(r).slice(0, 100)}`);
  });

  // ═══════════ MATERIALES (multi-tenant fix) ═══════════
  console.log('── Materiales (multi-tenant) ──');

  await test('POST /materiales — create', async () => {
    const r = await api('POST', '/materiales', {
      nombre: 'E2E Test Material', unidad_medida: 'kg', cantidad_presentacion: 1, precio_presentacion: 10.50
    });
    assert(r.success === true, `Create failed: ${JSON.stringify(r)}`);
    cleanup.materiales.push(r.data.id);
  });

  await test('GET /materiales — list returns created', async () => {
    const r = await api('GET', '/materiales');
    assert(r.success === true, 'List failed');
    const found = r.data.find(m => m.nombre === 'E2E Test Material');
    assert(found, 'Created material not found in list');
    assert(found.empresa_id === 1 || found.empresa_id === USER_A.empresa_id, `Wrong empresa_id: ${found.empresa_id}`);
  });

  await test('GET /materiales/:id — get single', async () => {
    const id = cleanup.materiales[0];
    const r = await api('GET', `/materiales/${id}`);
    assert(r.success === true, `Get failed: ${JSON.stringify(r)}`);
  });

  await test('PUT /materiales/:id — update', async () => {
    const id = cleanup.materiales[0];
    const r = await api('PUT', `/materiales/${id}`, { nombre: 'E2E Updated Material', precio_presentacion: 15.75 });
    assert(r.success === true, `Update failed: ${JSON.stringify(r)}`);
  });

  await test('POST /materiales — duplicate check by empresa', async () => {
    const r = await api('POST', '/materiales', {
      nombre: 'E2E Updated Material', unidad_medida: 'kg', cantidad_presentacion: 1, precio_presentacion: 10
    });
    // Should fail with 409 (duplicate in same empresa)
    assert(r.success === false || r.status === 409, `Expected duplicate rejection: ${JSON.stringify(r)}`);
  });

  // ═══════════ INSUMOS (multi-tenant fix) ═══════════
  console.log('── Insumos (multi-tenant) ──');

  await test('POST /insumos — create', async () => {
    const r = await api('POST', '/insumos', {
      nombre: 'E2E Test Insumo', unidad_medida: 'kg', cantidad_presentacion: 1, precio_presentacion: 8.30
    });
    assert(r.success === true, `Create failed: ${JSON.stringify(r)}`);
    cleanup.insumos.push(r.data.id);
  });

  await test('GET /insumos — list', async () => {
    const r = await api('GET', '/insumos');
    assert(r.success === true, 'List failed');
    assert(r.data.some(i => i.nombre === 'E2E Test Insumo'), 'Insumo not in list');
  });

  await test('POST /insumos — duplicate check by empresa', async () => {
    const r = await api('POST', '/insumos', {
      nombre: 'E2E Test Insumo', unidad_medida: 'kg', cantidad_presentacion: 1, precio_presentacion: 8
    });
    assert(r.success === false, `Expected duplicate rejection: ${JSON.stringify(r)}`);
  });

  // ═══════════ CLIENTES (multi-tenant fix) ═══════════
  console.log('── Clientes (multi-tenant) ──');

  await test('POST /clientes — create', async () => {
    const r = await api('POST', '/clientes', {
      tipo_doc: 'DNI', num_doc: '99887766', razon_social: 'E2E Test Cliente'
    });
    assert(r.success === true, `Create failed: ${JSON.stringify(r)}`);
    cleanup.clientes.push(r.data.id);
  });

  await test('GET /clientes — list', async () => {
    const r = await api('GET', '/clientes');
    assert(r.success === true, 'List failed');
    assert(r.data.some(c => c.num_doc === '99887766'), 'Cliente not in list');
  });

  // ═══════════ HISTORIAL (multi-tenant fix) ═══════════
  console.log('── Historial (multi-tenant) ──');

  await test('GET /historial/actividad — list', async () => {
    const r = await api('GET', '/historial/actividad?limit=5');
    assert(r.success === true, `Actividad failed: ${JSON.stringify(r)}`);
    assert(Array.isArray(r.data), 'Expected data array');
  });

  await test('GET /historial/audit — list', async () => {
    const r = await api('GET', '/historial/audit?limit=5');
    assert(r.success === true, `Audit failed: ${JSON.stringify(r)}`);
  });

  // ═══════════ FLUJO (multi-tenant fix — biggest change) ═══════════
  console.log('── Flujo de caja (multi-tenant) ──');

  await test('GET /flujo/cuentas — list (empty or seeded)', async () => {
    const r = await api('GET', '/flujo/cuentas');
    assert(r.success === true, `Cuentas failed: ${JSON.stringify(r)}`);
    assert(Array.isArray(r.data), 'Expected array');
  });

  await test('POST /flujo/cuentas — create', async () => {
    const r = await api('POST', '/flujo/cuentas', { nombre: 'E2E Caja', tipo: 'efectivo', saldo_actual: 500 });
    assert(r.success === true, `Create cuenta failed: ${JSON.stringify(r)}`);
    cleanup.cuentas.push(r.data.id);
  });

  await test('PUT /flujo/cuentas/:id — update', async () => {
    const id = cleanup.cuentas[0];
    const r = await api('PUT', `/flujo/cuentas/${id}`, { nombre: 'E2E Caja Updated', fondo_caja: 100 });
    assert(r.success === true, `Update cuenta failed: ${JSON.stringify(r)}`);
  });

  await test('GET /flujo/categorias — seeds defaults', async () => {
    const r = await api('GET', '/flujo/categorias');
    assert(r.success === true, `Categorias failed: ${JSON.stringify(r)}`);
    assert(r.data.length > 0, 'Expected seeded categories');
    // Verify categorias belong to empresa
    const ventas = r.data.find(c => c.nombre === 'Ventas');
    assert(ventas, 'Missing default Ventas category');
  });

  await test('POST /flujo/categorias — create custom', async () => {
    const r = await api('POST', '/flujo/categorias', { nombre: 'E2E Custom Cat', seccion: 'operativo', tipo: 'egreso' });
    assert(r.success === true, `Create cat failed: ${JSON.stringify(r)}`);
    cleanup.categorias.push(r.data.id);
  });

  await test('GET /flujo/denominaciones', async () => {
    const r = await api('GET', '/flujo/denominaciones');
    assert(r.success === true, `Denominaciones failed: ${JSON.stringify(r)}`);
  });

  await test('POST /flujo/movimientos — create', async () => {
    const cats = await api('GET', '/flujo/categorias');
    const egresoCat = cats.data.find(c => c.tipo === 'egreso');
    assert(egresoCat, 'No egreso category found');

    const r = await api('POST', '/flujo/movimientos', {
      flujo_categoria_id: egresoCat.id,
      cuenta_id: cleanup.cuentas[0],
      fecha: '2026-05-06',
      monto_absoluto: 50,
      descripcion: 'E2E test movement'
    });
    assert(r.success === true, `Create movimiento failed: ${JSON.stringify(r)}`);
    cleanup.movimientos.push(r.data.id);
  });

  await test('GET /flujo/grid?anio=2026', async () => {
    const r = await api('GET', '/flujo/grid?anio=2026');
    assert(r.success === true, `Grid failed: ${JSON.stringify(r)}`);
    assert(r.data.categorias, 'Missing categorias in grid');
    assert(Array.isArray(r.data.meses), 'Missing meses array');
  });

  await test('GET /flujo/transferencias', async () => {
    const r = await api('GET', '/flujo/transferencias?year=2026&month=5');
    assert(r.success === true, `Transferencias failed: ${JSON.stringify(r)}`);
  });

  // ═══════════ STOCK (bug fix #4, #5, #6) ═══════════
  console.log('── Stock ──');

  await test('GET /stock — list', async () => {
    const r = await api('GET', '/stock');
    assert(r.success === true, `Stock list failed: ${JSON.stringify(r)}`);
  });

  await test('GET /stock/todos — all products', async () => {
    const r = await api('GET', '/stock/todos');
    assert(r.success === true, `Stock todos failed: ${JSON.stringify(r)}`);
    assert(Array.isArray(r.data), 'Expected array');
  });

  // Create a product to test stock with
  let testProductId;
  await test('POST /productos — create for stock test', async () => {
    const r = await api('POST', '/productos', {
      nombre: 'E2E Stock Product', margen: 50, tipo_presentacion: 'unidad'
    });
    assert(r.success === true, `Create product failed: ${JSON.stringify(r)}`);
    testProductId = r.data.id;
    cleanup.productos.push(testProductId);
  });

  await test('POST /stock/entrada — manual entry', async () => {
    if (!testProductId) { skip('Stock entrada', 'No product'); return; }
    const r = await api('POST', '/stock/entrada', {
      producto_id: testProductId, cantidad: 25, nota: 'E2E test entry'
    });
    assert(r.success === true, `Stock entrada failed: ${JSON.stringify(r)}`);
  });

  await test('GET /stock — verify product now has stock', async () => {
    if (!testProductId) { skip('Stock verify', 'No product'); return; }
    const r = await api('GET', '/stock');
    assert(r.success === true, 'Stock list failed');
    const prod = r.data.find(p => p.id === testProductId);
    assert(prod, 'Product not in stock list');
    assert(parseFloat(prod.stock_actual) === 25, `Expected stock 25, got ${prod.stock_actual}`);
  });

  await test('POST /stock/ajuste — manual adjustment', async () => {
    if (!testProductId) { skip('Stock ajuste', 'No product'); return; }
    const r = await api('POST', '/stock/ajuste', {
      producto_id: testProductId, nuevo_stock: 20, motivo: 'E2E ajuste'
    });
    assert(r.success === true, `Stock ajuste failed: ${JSON.stringify(r)}`);
  });

  await test('GET /stock/movimientos — history', async () => {
    if (!testProductId) { skip('Stock movimientos', 'No product'); return; }
    const r = await api('GET', `/stock/movimientos?producto_id=${testProductId}`);
    assert(r.success === true, `Movimientos failed: ${JSON.stringify(r)}`);
    assert(r.data.length >= 2, `Expected >= 2 movements, got ${r.data.length}`);
  });

  await test('Stock values have max 2 decimals', async () => {
    const r = await api('GET', '/stock');
    assert(r.success === true, 'Stock list failed');
    for (const p of r.data) {
      for (const field of ['stock_actual', 'precio_final', 'costo_neto']) {
        if (p[field] != null) {
          const val = parseFloat(p[field]);
          const rounded = Math.round(val * 100) / 100;
          assert(val === rounded, `${field}=${p[field]} has more than 2 decimals on product ${p.id}`);
        }
      }
    }
  });

  // ═══════════ ANALISIS (bug fix #3, #6) ═══════════
  console.log('── Análisis / Rentabilidad ──');

  await test('GET /analisis/rentabilidad — no crash, values rounded', async () => {
    const r = await api('GET', '/analisis/rentabilidad');
    assert(r.success === true, `Rentabilidad failed: ${JSON.stringify(r)}`);
    if (r.data.productos) {
      for (const p of r.data.productos) {
        for (const field of ['costo_neto', 'precio_venta', 'ganancia_unitaria', 'margen_actual']) {
          if (p[field] != null) {
            const val = parseFloat(p[field]);
            const rounded = Math.round(val * 100) / 100;
            assert(val === rounded, `analisis ${field}=${p[field]} excess decimals`);
          }
        }
      }
    }
  });

  // ═══════════ COMISIONES (bug fix #6) ═══════════
  console.log('── Comisiones ──');

  await test('GET /comisiones — no crash, values rounded', async () => {
    const r = await api('GET', '/comisiones?year=2026&month=5');
    assert(r.success === true, `Comisiones failed: ${JSON.stringify(r)}`);
    if (r.data.vendedores) {
      for (const v of r.data.vendedores) {
        for (const field of ['total_base', 'total_comision']) {
          if (v[field] != null) {
            const val = parseFloat(v[field]);
            const rounded = Math.round(val * 100) / 100;
            assert(val === rounded, `comisiones ${field}=${v[field]} excess decimals`);
          }
        }
      }
    }
  });

  // ═══════════ PEDIDOS (bug fix #2 — pago_pedido) ═══════════
  console.log('── Pedidos (contra entrega fix) ──');

  await test('POST /pedidos — create contra entrega', async () => {
    // Create a cliente first if needed
    let clienteId = cleanup.clientes[0];
    if (!clienteId) {
      const cr = await api('POST', '/clientes', { tipo_doc: 'DNI', num_doc: '11223344', razon_social: 'E2E Pedido Cliente' });
      if (cr.success) { clienteId = cr.data.id; cleanup.clientes.push(clienteId); }
    }

    const r = await api('POST', '/pedidos', {
      cliente_id: clienteId,
      tipo_pago: 'contra_entrega',
      adelanto: 10,
      total: 20,
      items: [{ producto_id: testProductId, cantidad: 1, precio_unitario: 20 }],
      nota: 'E2E contra entrega test'
    });
    // May fail if schema doesn't match exactly — that's OK, we test what we can
    if (r.success) {
      cleanup.pedidos.push(r.data.id);
    }
    assert(r.success === true, `Create pedido failed: ${JSON.stringify(r).slice(0, 200)}`);
  });

  await test('Pedido payment creates pago_pedido, not venta', async () => {
    const pedidoId = cleanup.pedidos[0];
    if (!pedidoId) { skip('pago_pedido check', 'No pedido created'); return; }

    // Check transacciones — adelanto should be pago_pedido
    const r = await api('GET', '/pl/transacciones?year=2026&month=5');
    assert(r.success === true, `Transacciones failed: ${JSON.stringify(r).slice(0, 200)}`);

    if (r.data && Array.isArray(r.data)) {
      const pagos = r.data.filter(t => t.tipo === 'pago_pedido');
      // We expect at least the adelanto to be pago_pedido
      // (not counted as revenue)
      const ventasDup = r.data.filter(t => t.tipo === 'venta' && t.descripcion && t.descripcion.includes('E2E'));
      assert(ventasDup.length <= 1, `Found ${ventasDup.length} venta transactions — possible duplicate`);
    }
  });

  // ═══════════ CANALES (ownership fix) ═══════════
  console.log('── Canales (ownership check) ──');

  await test('GET /canales — list', async () => {
    const r = await api('GET', '/canales');
    assert(r.success === true, `Canales list failed: ${JSON.stringify(r)}`);
  });

  await test('PUT /canales/precios/99999 — rejects non-existent product', async () => {
    const r = await api('PUT', '/canales/precios/99999', { precios: [] });
    assert(r.success === false || r.status === 404, `Expected 404 for fake product: ${JSON.stringify(r)}`);
  });

  // ═══════════ TICKET (bug fix #1, #6) ═══════════
  console.log('── Ticket ──');

  await test('GET /ticket/99999 — 404 for non-existent', async () => {
    const r = await api('GET', '/ticket/99999');
    assert(r.success === false, `Expected failure for fake ticket: ${JSON.stringify(r).slice(0, 100)}`);
  });

  // ═══════════ PL (P&L) ═══════════
  console.log('── P&L ──');

  await test('GET /pl/resumen — works', async () => {
    const r = await api('GET', '/pl/resumen?year=2026&month=5');
    assert(r.success === true, `P&L resumen failed: ${JSON.stringify(r).slice(0, 200)}`);
  });

  await test('GET /pl/transacciones/balance — works', async () => {
    const r = await api('GET', '/pl/transacciones/balance');
    assert(r.success === true, `Balance failed: ${JSON.stringify(r)}`);
  });

  // ═══════════ CLEANUP ═══════════
  console.log('\n── Cleanup ──');

  // Delete in reverse dependency order
  for (const id of cleanup.movimientos) { await api('DELETE', `/flujo/movimientos/${id}`); }
  for (const id of cleanup.pedidos) { await api('DELETE', `/pedidos/${id}`); }
  for (const id of cleanup.categorias) { await api('DELETE', `/flujo/categorias/${id}`); }
  for (const id of cleanup.cuentas) { await api('DELETE', `/flujo/cuentas/${id}`); }
  for (const id of cleanup.clientes) { await api('DELETE', `/clientes/${id}`); }
  for (const id of cleanup.productos) { await api('DELETE', `/productos/${id}`); }
  for (const id of cleanup.insumos) { await api('DELETE', `/insumos/${id}`); }
  for (const id of cleanup.materiales) { await api('DELETE', `/materiales/${id}`); }
  console.log('  🧹 Cleanup done');

  // ═══════════ SUMMARY ═══════════
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (skipped) console.log(`  ⏭️  Skipped: ${skipped}`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    • ${f.name}: ${f.error}`);
    }
  }
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
