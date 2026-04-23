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

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Calculate costs from a product detail object.
 * @param {object} detalle
 * @param {Array} detalle.insumos - [{ precio_presentacion, cantidad_presentacion, cantidad_usada }]
 * @param {number} detalle.costo_empaque
 * @param {number} detalle.margen - e.g. 0.30 for 30%
 * @param {number} detalle.igv_rate - e.g. 0.18 for 18%
 */
function calcularCostos(detalle) {
  const { insumos = [], costo_empaque = 0, margen = 0, igv_rate = 0 } = detalle;

  let costo_insumos = 0;

  const insumos_detalle = insumos.map((ins) => {
    const costo_unitario = round4(ins.precio_presentacion / ins.cantidad_presentacion);
    const costo_linea = round4(ins.cantidad_usada * costo_unitario);
    costo_insumos += costo_linea;
    return {
      ...ins,
      costo_unitario,
      costo_linea,
    };
  });

  costo_insumos = round4(costo_insumos);
  const costo_neto = round4(costo_insumos + costo_empaque);
  const precio_venta = margen < 1 ? round4(costo_neto / (1 - margen)) : costo_neto;
  const precio_final = round4(precio_venta * (1 + igv_rate));

  return {
    costo_insumos,
    costo_empaque: round4(costo_empaque),
    costo_neto,
    precio_venta,
    precio_final,
    insumos_detalle,
  };
}

/**
 * Recalculate a single product by its ID and persist the new values.
 */
async function recalcularProducto(pool, productoId, motivo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query(
      'SELECT * FROM productos WHERE id = $1',
      [productoId]
    );
    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const producto = prodRes.rows[0];

    // Fetch insumos linked to this product through preparaciones
    const insumosRes = await client.query(
      `SELECT pi.id, pi.cantidad_usada, i.precio_presentacion, i.cantidad_presentacion, i.nombre,
              pi.preparacion_id
       FROM preparacion_insumos pi
       JOIN insumos i ON i.id = pi.insumo_id
       JOIN preparaciones p ON p.id = pi.preparacion_id
       WHERE p.producto_id = $1`,
      [productoId]
    );

    // Fetch materiales linked to this product
    const materialesRes = await client.query(
      `SELECT pm.id, pm.cantidad, m.precio_presentacion, m.cantidad_presentacion, m.nombre
       FROM producto_materiales pm
       JOIN materiales_empaque m ON m.id = pm.material_id
       WHERE pm.producto_id = $1`,
      [productoId]
    );

    // Calculate costo_empaque from materials
    let costo_empaque = 0;
    for (const mat of materialesRes.rows) {
      const cu = round4(mat.precio_presentacion / mat.cantidad_presentacion);
      costo_empaque += round4(mat.cantidad * cu);
    }
    costo_empaque = round4(costo_empaque);

    const insumos = insumosRes.rows.map((r) => ({
      precio_presentacion: parseFloat(r.precio_presentacion),
      cantidad_presentacion: parseFloat(r.cantidad_presentacion),
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
        costo_insumos = $1,
        costo_empaque = $2,
        costo_neto = $3,
        precio_venta = $4,
        precio_final = $5,
        updated_at = NOW()
       WHERE id = $6`,
      [
        costos.costo_insumos,
        costos.costo_empaque,
        costos.costo_neto,
        costos.precio_venta,
        costos.precio_final,
        productoId,
      ]
    );

    // Save version snapshot
    const versionRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM producto_versiones WHERE producto_id = $1',
      [productoId]
    );
    const nextVersion = versionRes.rows[0].next;

    await client.query(
      `INSERT INTO producto_versiones (producto_id, version, snapshot, motivo)
       VALUES ($1, $2, $3, $4)`,
      [
        productoId,
        nextVersion,
        JSON.stringify({ ...producto, ...costos }),
        motivo || 'Recalculo automatico',
      ]
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

/**
 * Find all products that use a given insumo and recalculate them.
 */
async function recalcularProductosPorInsumo(pool, insumoId, usuarioId) {
  const res = await pool.query(
    `SELECT DISTINCT p.id
     FROM productos p
     JOIN preparaciones prep ON prep.producto_id = p.id
     JOIN preparacion_insumos pi ON pi.preparacion_id = prep.id
     WHERE pi.insumo_id = $1 AND p.usuario_id = $2`,
    [insumoId, usuarioId]
  );

  const results = [];
  for (const row of res.rows) {
    const costos = await recalcularProducto(pool, row.id, 'Cambio de precio de insumo');
    results.push({ producto_id: row.id, costos });
  }
  return results;
}

/**
 * Find all products that use a given material and recalculate them.
 */
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

module.exports = {
  calcularCostos,
  recalcularProducto,
  recalcularProductosPorInsumo,
  recalcularProductosPorMaterial,
  round4,
};
