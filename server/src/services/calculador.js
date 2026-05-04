/**
 * Calculador de costos para productos.
 *
 * Formulas:
 *   costo_unitario_insumo = precio_presentacion / cantidad_presentacion
 *   costo_linea           = cantidad_usada * costo_unitario
 *   costo_neto            = costo_insumos + costo_empaque
 *   precio_venta          = costo_neto / (1 - margen)
 *   precio_final          = precio_venta * (1 + igv_rate)
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Backward compat alias — all rounding is now 2 decimals
const round4 = round2;

// Convert quantity from uso_unidad to insumo's unidad_medida
const FACTORES = {
  'g→kg': 0.001, 'kg→g': 1000,
  'g→oz': 0.03527, 'oz→g': 28.3495,
  'kg→oz': 35.274, 'oz→kg': 0.02835,
  'ml→L': 0.001, 'L→ml': 1000,
  'ml→l': 0.001, 'l→ml': 1000,
  'l→L': 1, 'L→l': 1,
};

function convertirCantidad(cantidad, usoUnidad, unidadOriginal) {
  if (!usoUnidad || !unidadOriginal || usoUnidad === unidadOriginal) return cantidad;
  const key = `${usoUnidad}→${unidadOriginal}`;
  if (FACTORES[key]) return cantidad * FACTORES[key];
  return cantidad;
}

function calcularCostos(detalle) {
  const { insumos = [], costo_empaque = 0, margen = 0, igv_rate = 0 } = detalle;

  let costo_insumos = 0;

  const insumos_detalle = insumos.map((ins) => {
    const costo_unitario = round4(ins.precio_presentacion / ins.cantidad_presentacion);
    // Convert cantidad from uso_unidad to the insumo's original unit
    const cantidadConvertida = convertirCantidad(ins.cantidad_usada, ins.uso_unidad, ins.unidad_medida);
    const costo_linea = round4(cantidadConvertida * costo_unitario);
    costo_insumos += costo_linea;
    return { ...ins, costo_unitario, costo_linea };
  });

  costo_insumos = round4(costo_insumos);
  const costo_neto = round4(costo_insumos + costo_empaque);
  const precio_venta = margen < 1 ? round4(costo_neto / (1 - margen)) : costo_neto;
  const precio_final = round2(precio_venta * (1 + igv_rate));

  return { costo_insumos, costo_empaque: round4(costo_empaque), costo_neto, precio_venta, precio_final, insumos_detalle };
}

async function recalcularProducto(pool, productoId, motivo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query('SELECT * FROM productos WHERE id = $1', [productoId]);
    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const producto = prodRes.rows[0];

    const insumosRes = await client.query(
      `SELECT ppi.cantidad AS cantidad_usada, ppi.uso_unidad, i.precio_presentacion, i.cantidad_presentacion, i.unidad_medida
       FROM producto_prep_insumos ppi
       JOIN insumos i ON i.id = ppi.insumo_id
       JOIN producto_preparaciones pp ON pp.id = ppi.producto_preparacion_id
       WHERE pp.producto_id = $1`,
      [productoId]
    );

    const materialesRes = await client.query(
      `SELECT pm.cantidad, m.precio_presentacion, m.cantidad_presentacion
       FROM producto_materiales pm
       JOIN materiales m ON m.id = pm.material_id
       WHERE pm.producto_id = $1`,
      [productoId]
    );

    let costo_empaque = 0;
    for (const mat of materialesRes.rows) {
      const cu = round4(parseFloat(mat.precio_presentacion) / parseFloat(mat.cantidad_presentacion));
      costo_empaque += round4(parseFloat(mat.cantidad) * cu);
    }
    costo_empaque = round4(costo_empaque);

    const insumos = insumosRes.rows.map((r) => ({
      precio_presentacion: parseFloat(r.precio_presentacion),
      cantidad_presentacion: parseFloat(r.cantidad_presentacion),
      unidad_medida: r.unidad_medida,
      uso_unidad: r.uso_unidad || r.unidad_medida,
      cantidad_usada: parseFloat(r.cantidad_usada),
    }));

    const costos = calcularCostos({
      insumos,
      costo_empaque,
      margen: parseFloat(producto.margen) || 0,
      igv_rate: parseFloat(producto.igv_rate) || 0,
    });

    await client.query(
      `UPDATE productos SET
        costo_insumos = $1, costo_empaque = $2, costo_neto = $3,
        precio_venta = $4, precio_final = $5, updated_at = NOW()
       WHERE id = $6`,
      [costos.costo_insumos, costos.costo_empaque, costos.costo_neto, costos.precio_venta, costos.precio_final, productoId]
    );

    const versionRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM producto_versiones WHERE producto_id = $1',
      [productoId]
    );

    await client.query(
      `INSERT INTO producto_versiones (producto_id, version, snapshot_json, motivo, costo_neto, precio_final)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productoId, versionRes.rows[0].next, JSON.stringify({ ...producto, ...costos }), motivo || 'Recalculo automatico', costos.costo_neto, costos.precio_final]
    );

    await client.query('COMMIT');
    return costos;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function recalcularProductosPorInsumo(pool, insumoId, usuarioId) {
  const res = await pool.query(
    `SELECT DISTINCT p.id
     FROM productos p
     JOIN producto_preparaciones pp ON pp.producto_id = p.id
     JOIN producto_prep_insumos ppi ON ppi.producto_preparacion_id = pp.id
     WHERE ppi.insumo_id = $1 AND p.usuario_id = $2`,
    [insumoId, usuarioId]
  );

  const results = [];
  for (const row of res.rows) {
    const costos = await recalcularProducto(pool, row.id, 'Cambio de precio de insumo');
    results.push({ producto_id: row.id, costos });
  }
  return results;
}

async function recalcularProductosPorMaterial(pool, materialId, usuarioId) {
  const res = await pool.query(
    `SELECT DISTINCT p.id
     FROM productos p
     JOIN producto_materiales pm ON pm.producto_id = p.id
     WHERE pm.material_id = $1 AND p.usuario_id = $2`,
    [materialId, usuarioId]
  );

  const results = [];
  for (const row of res.rows) {
    const costos = await recalcularProducto(pool, row.id, 'Cambio de precio de material');
    results.push({ producto_id: row.id, costos });
  }
  return results;
}

module.exports = { calcularCostos, recalcularProducto, recalcularProductosPorInsumo, recalcularProductosPorMaterial, round4, round2 };
