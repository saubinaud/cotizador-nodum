const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { getDateRange } = require('../utils/dateRange');

const router = express.Router();
router.use(auth);

// GET /api/analisis/rentabilidad
router.get('/rentabilidad', async (req, res) => {
  try {
    const empresaId = req.eid;
    const { start, end } = await getDateRange(req);

    // 1. All products for the empresa
    const { rows: productos } = await pool.query(
      `SELECT id, nombre, imagen_url, costo_neto, precio_venta, precio_final, margen, igv_rate
       FROM productos WHERE empresa_id = $1`,
      [empresaId]
    );

    // 2. Fixed costs
    const { rows: [gastosRow] } = await pool.query(
      `SELECT COALESCE(SUM(monto_absoluto),0) as total
       FROM transacciones WHERE empresa_id=$1 AND tipo='gasto' AND fecha>=$2 AND fecha<=$3`,
      [empresaId, start, end]
    );

    let gastosFijos = parseFloat(gastosRow.total);

    if (gastosFijos === 0) {
      const { rows: [fallbackRow] } = await pool.query(
        `SELECT COALESCE(SUM(monto_default),0) as total
         FROM categorias_gasto WHERE empresa_id=$1 AND recurrente=true AND activa=true`,
        [empresaId]
      );
      gastosFijos = parseFloat(fallbackRow.total);
    }

    // 3. Units sold per product in the date range
    const { rows: ventasRows } = await pool.query(
      `SELECT producto_id, SUM(cantidad) as unidades, SUM(monto_absoluto) as revenue
       FROM transacciones WHERE empresa_id=$1 AND tipo='venta' AND fecha>=$2 AND fecha<=$3
       GROUP BY producto_id`,
      [empresaId, start, end]
    );

    const sales = {};
    ventasRows.forEach(r => {
      sales[r.producto_id] = {
        unidades: parseFloat(r.unidades) || 0,
        revenue: parseFloat(r.revenue) || 0,
      };
    });

    // 4. Total units sold and revenue
    const totalUnidades = Object.values(sales).reduce((sum, s) => sum + s.unidades, 0);
    const totalRevenue = Object.values(sales).reduce((sum, s) => sum + s.revenue, 0);

    // 5. Margin minimum: empresa override → giro benchmark → 33% default
    let margenMinimoGlobal = 33;
    let nombreRubro = null;
    let margenRubro = null;
    try {
      const { rows: [emp] } = await pool.query(
        `SELECT e.margen_minimo_global, e.giro_negocio_id, g.margen_minimo as margen_giro, g.nombre as giro_nombre
         FROM empresas e
         LEFT JOIN giros_negocio g ON g.id = e.giro_negocio_id
         WHERE e.id = $1`,
        [empresaId]
      );
      if (emp) {
        nombreRubro = emp.giro_nombre || null;
        margenRubro = emp.margen_giro ? parseFloat(emp.margen_giro) : null;
        if (emp.margen_minimo_global && parseFloat(emp.margen_minimo_global) > 0) {
          margenMinimoGlobal = parseFloat(emp.margen_minimo_global);
        } else if (margenRubro) {
          margenMinimoGlobal = margenRubro;
        }
      }
    } catch (_) { /* use default */ }

    // 6. Calculate per product
    const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

    const resultado = productos.map(p => {
      const costoNeto = r2(p.costo_neto);
      const precioVenta = r2(p.precio_venta);
      const gananciaUnitaria = r2(precioVenta - costoNeto);
      const margenActual = costoNeto > 0 ? ((precioVenta - costoNeto) / precioVenta) * 100 : 0;

      const unidades = sales[p.id]?.unidades || 0;
      const costoFijoUnitario = totalUnidades > 0 ? gastosFijos / totalUnidades : 0;
      const costoTotalUnitario = costoNeto + costoFijoUnitario;

      const precioMinimo = costoTotalUnitario;
      const margenConFijos = precioVenta > 0
        ? ((precioVenta - costoTotalUnitario) / precioVenta) * 100
        : 0;

      let semaforo;
      if (margenConFijos >= margenMinimoGlobal) {
        semaforo = 'verde';
      } else if (margenConFijos >= 0) {
        semaforo = 'amarillo';
      } else {
        semaforo = 'rojo';
      }

      const contribucion = (precioVenta - costoNeto) * unidades;
      const revenue = r2(sales[p.id]?.revenue || 0);

      return {
        id: p.id,
        nombre: p.nombre,
        imagen_url: p.imagen_url,
        costo_neto: costoNeto,
        precio_venta: precioVenta,
        ganancia_unitaria: gananciaUnitaria,
        margen_actual: r2(margenActual),
        costo_fijo_unitario: r2(costoFijoUnitario),
        costo_total_unitario: r2(costoTotalUnitario),
        precio_minimo: r2(precioMinimo),
        margen_con_fijos: r2(margenConFijos),
        semaforo,
        unidades,
        contribucion: r2(contribucion),
        revenue,
      };
    });

    // Sort: rojo first, then amarillo, then verde
    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    resultado.sort((a, b) => orden[a.semaforo] - orden[b.semaforo]);

    const resumen = {
      gastos_fijos_mes: r2(gastosFijos),
      total_unidades_mes: totalUnidades,
      total_revenue: r2(totalRevenue),
      margen_promedio: totalRevenue > 0 ? r2(resultado.reduce((s, p) => s + p.margen_actual * (p.revenue || 0), 0) / totalRevenue) : 0,
      productos_verde: resultado.filter(p => p.semaforo === 'verde').length,
      productos_amarillo: resultado.filter(p => p.semaforo === 'amarillo').length,
      productos_rojo: resultado.filter(p => p.semaforo === 'rojo').length,
      margen_minimo_usado: r2(margenMinimoGlobal),
      nombre_rubro: nombreRubro,
      margen_rubro: margenRubro ? r2(margenRubro) : null,
    };

    res.json({ success: true, data: { productos: resultado, resumen } });
  } catch (err) {
    console.error('Error en rentabilidad:', err);
    res.status(500).json({ success: false, error: 'Error al calcular rentabilidad' });
  }
});

// POST /api/analisis/bundle
router.post('/bundle', async (req, res) => {
  try {
    const empresaId = req.eid;
    const { items, descuento_pct } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Se requiere al menos un item' });
    }

    const descuento = parseFloat(descuento_pct) || 0;

    // 1. Fetch each product
    const detalle = [];
    let costoTotal = 0;
    let precioSinDescuento = 0;

    for (const item of items) {
      const { rows: [producto] } = await pool.query(
        `SELECT id, nombre, costo_neto, precio_venta, precio_final
         FROM productos WHERE id = $1 AND empresa_id = $2`,
        [item.producto_id, empresaId]
      );

      if (!producto) {
        return res.status(404).json({ success: false, error: `Producto ${item.producto_id} no encontrado` });
      }

      const cantidad = parseFloat(item.cantidad) || 1;
      const costoNeto = parseFloat(producto.costo_neto) || 0;
      const precioFinal = parseFloat(producto.precio_final) || 0;

      costoTotal += costoNeto * cantidad;
      precioSinDescuento += precioFinal * cantidad;

      detalle.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad,
        costo_neto: costoNeto,
        precio_final: precioFinal,
      });
    }

    // 2. Calculate bundle
    const montoDescuento = precioSinDescuento * (descuento / 100);
    const precioBundle = precioSinDescuento - montoDescuento;
    const gananciaBundle = precioBundle - costoTotal;
    const margenBundle = precioBundle > 0
      ? ((precioBundle - costoTotal) / precioBundle) * 100
      : 0;

    // Max discount before losing money
    const descuentoMaximo = precioSinDescuento > 0
      ? ((precioSinDescuento - costoTotal) / precioSinDescuento) * 100
      : 0;

    // Min price with minimum margin (33%)
    const margenMin = 0.33;
    const precioMinimo = costoTotal / (1 - margenMin);

    let semaforo;
    if (margenBundle >= 33) {
      semaforo = 'verde';
    } else if (margenBundle >= 0) {
      semaforo = 'amarillo';
    } else {
      semaforo = 'rojo';
    }

    res.json({
      success: true,
      data: {
        items: detalle,
        costo_total: Math.round(costoTotal * 100) / 100,
        precio_sin_descuento: Math.round(precioSinDescuento * 100) / 100,
        descuento_pct: descuento,
        descuento_monto: Math.round(montoDescuento * 100) / 100,
        precio_bundle: Math.round(precioBundle * 100) / 100,
        ganancia_bundle: Math.round(gananciaBundle * 100) / 100,
        margen_bundle: Math.round(margenBundle * 100) / 100,
        descuento_maximo: Math.round(descuentoMaximo * 100) / 100,
        precio_minimo: Math.round(precioMinimo * 100) / 100,
        semaforo,
      },
    });
  } catch (err) {
    console.error('Error en bundle:', err);
    res.status(500).json({ success: false, error: 'Error al calcular bundle' });
  }
});

module.exports = router;
