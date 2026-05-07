const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { registrarMovimiento } = require('./stock');

const router = express.Router();
router.use(auth);

// --------------- Shopify Token + GraphQL Helpers ---------------

// Token cache: { storeUrl: { token, expires } }
const _tokenCache = {};

async function getShopifyToken(storeUrl, clientId, clientSecret) {
  const cacheKey = storeUrl;
  const cached = _tokenCache[cacheKey];
  if (cached && Date.now() < cached.expires) return cached.token;

  // Exchange client_credentials for access_token (expires in 24h)
  const res = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
  });
  if (!res.ok) throw new Error(`Shopify auth error: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in response');

  // Cache with 23h expiry (token lasts 24h)
  _tokenCache[cacheKey] = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 3600) * 1000,
  };
  return data.access_token;
}

async function shopifyGQL(storeUrl, accessToken, query, variables = {}) {
  const res = await fetch(`https://${storeUrl}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');
  return data.data;
}

// Helper: get token from DB config and auto-refresh
async function getTokenForEmpresa(integ) {
  const { store_url, client_id, client_secret } = integ.config || {};
  if (!store_url || !client_id || !client_secret) throw new Error('Config incompleta');
  return getShopifyToken(store_url, client_id, client_secret);
}

/** Extract numeric ID from Shopify GID, e.g. "gid://shopify/Order/123456" -> "123456" */
function extractGid(gid) {
  if (!gid) return null;
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/** Find periodo_id for a given date (mirrors pl.js helper) */
async function findPeriodoId(empresaId, fecha) {
  try {
    const r = await pool.query(
      'SELECT id FROM periodos WHERE empresa_id = $1 AND fecha_inicio <= $2 AND fecha_fin >= $2',
      [empresaId, fecha]
    );
    return r.rows[0]?.id || null;
  } catch (_) {
    return null;
  }
}

// --------------- GET /api/shopify/status ---------------

router.get('/status', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM integraciones WHERE empresa_id = $1 AND tipo = 'shopify'",
      [req.eid]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: { connected: false } });
    }

    const integ = result.rows[0];
    if (!integ.activo) {
      return res.json({ success: true, data: { connected: false, store_url: integ.config.store_url } });
    }

    // Verify connection is alive
    let storeName = integ.config.store_name || null;
    let productosShopify = 0;
    try {
      const shopData = await shopifyGQL(integ.config.store_url, await getTokenForEmpresa(integ), `{
        shop { name }
        productsCount { count }
      }`);
      storeName = shopData.shop.name;
      productosShopify = shopData.productsCount?.count || 0;
    } catch (err) {
      console.error('Shopify status check failed:', err.message);
      return res.json({
        success: true,
        data: {
          connected: true,
          store_url: integ.config.store_url,
          store_name: storeName,
          error: 'No se pudo verificar la conexion con Shopify',
          ultima_sync: integ.ultima_sync,
        },
      });
    }

    // Count linked products
    const linked = await pool.query(
      'SELECT COUNT(*) FROM productos WHERE empresa_id = $1 AND shopify_variant_id IS NOT NULL',
      [req.eid]
    );

    return res.json({
      success: true,
      data: {
        connected: true,
        store_url: integ.config.store_url,
        store_name: storeName,
        productos_shopify: productosShopify,
        productos_vinculados: parseInt(linked.rows[0].count),
        ultima_sync: integ.ultima_sync,
      },
    });
  } catch (err) {
    console.error('Shopify status error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// --------------- POST /api/shopify/connect ---------------

router.post('/connect', async (req, res) => {
  try {
    let { store_url, client_id, client_secret } = req.body;
    if (!store_url || !client_id || !client_secret) {
      return res.status(400).json({ success: false, error: 'Store URL, Client ID y Client Secret son requeridos' });
    }

    // Clean store_url
    store_url = store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!store_url.includes('.myshopify.com')) store_url += '.myshopify.com';

    // Get access token via client_credentials grant
    let accessToken;
    try {
      accessToken = await getShopifyToken(store_url, client_id, client_secret);
    } catch (err) {
      return res.status(400).json({ success: false, error: `No se pudo autenticar: ${err.message}. Verifica tus credenciales.` });
    }

    // Test connection with the token
    let storeName = '';
    let locationId = null;
    let locationGid = null;
    try {
      const shopData = await shopifyGQL(store_url, accessToken, `{ shop { name } }`);
      storeName = shopData.shop.name;
    } catch (err) {
      return res.status(400).json({ success: false, error: `Token obtenido pero error al conectar: ${err.message}` });
    }

    // Try to get location (optional — some apps don't have this scope)
    try {
      const locData = await shopifyGQL(store_url, accessToken, `{ locations(first: 1) { edges { node { id name } } } }`);
      const locationEdge = locData.locations?.edges?.[0];
      locationId = locationEdge ? extractGid(locationEdge.node.id) : null;
      locationGid = locationEdge?.node?.id || null;
    } catch (_) { /* location scope not available */ }

    // UPSERT integration — save client_id + secret (NOT the temporary token)
    await pool.query(
      `INSERT INTO integraciones (empresa_id, tipo, access_token, config, activo, ultima_sync)
       VALUES ($1, 'shopify', $2, $3, true, NULL)
       ON CONFLICT (empresa_id, tipo) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         config = EXCLUDED.config,
         activo = true`,
      [
        req.eid,
        'auto', // token se genera automáticamente via client_credentials
        JSON.stringify({ store_url, client_id, client_secret, store_name: storeName, location_id: locationId, location_gid: locationGid }),
      ]
    );

    return res.json({
      success: true,
      data: { connected: true, store_name: storeName, location_id: locationId },
    });
  } catch (err) {
    console.error('Shopify connect error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// --------------- DELETE /api/shopify/disconnect ---------------

router.delete('/disconnect', async (req, res) => {
  try {
    await pool.query(
      "UPDATE integraciones SET activo = false, updated_at = NOW() WHERE empresa_id = $1 AND tipo = 'shopify'",
      [req.eid]
    );
    return res.json({ success: true, data: { connected: false } });
  } catch (err) {
    console.error('Shopify disconnect error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// --------------- POST /api/shopify/sync-products ---------------

router.post('/sync-products', async (req, res) => {
  try {
    const integ = await getIntegration(req.eid);
    if (!integ) return res.status(400).json({ success: false, error: 'Shopify no esta conectado' });

    // Fetch all Shopify products (paginated)
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : '';
      const data = await shopifyGQL(integ.config.store_url, await getTokenForEmpresa(integ), `{
        products(first: 250${afterClause}) {
          edges {
            cursor
            node {
              id
              title
              images(first: 1) { edges { node { url } } }
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                    inventoryQuantity
                    inventoryItem { id }
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`);

      const edges = data.products.edges;
      allProducts.push(...edges.map(e => e.node));
      hasNextPage = data.products.pageInfo.hasNextPage;
      if (hasNextPage && edges.length > 0) {
        cursor = edges[edges.length - 1].cursor;
      } else {
        hasNextPage = false;
      }
    }

    // Match by SKU
    let vinculados = 0;
    let sinMatch = [];
    const detalles = [];

    for (const product of allProducts) {
      const imageUrl = product.images?.edges?.[0]?.node?.url || null;

      for (const ve of product.variants.edges) {
        const variant = ve.node;
        if (!variant.sku) continue;

        const match = await pool.query(
          'SELECT id FROM productos WHERE LOWER(sku) = LOWER($1) AND empresa_id = $2',
          [variant.sku, req.eid]
        );

        if (match.rows.length > 0) {
          await pool.query(
            `UPDATE productos SET
              shopify_product_id = $1,
              shopify_variant_id = $2,
              shopify_inventory_item_id = $3,
              updated_at = NOW()
             WHERE id = $4`,
            [extractGid(product.id), extractGid(variant.id), extractGid(variant.inventoryItem?.id), match.rows[0].id]
          );
          vinculados++;
          detalles.push({
            sku: variant.sku,
            shopify_title: product.title,
            kudi_id: match.rows[0].id,
            status: 'vinculado',
          });
        } else {
          sinMatch.push(variant.sku);
          detalles.push({
            sku: variant.sku,
            shopify_title: product.title,
            status: 'sin_match',
          });
        }
      }
    }

    // Log sync
    await logSync(req.eid, 'sync_products', 'ok', { vinculados, sin_match: sinMatch.length, total_shopify: allProducts.length });

    // Update ultima_sync
    await pool.query(
      "UPDATE integraciones SET ultima_sync = NOW() WHERE empresa_id = $1 AND tipo = 'shopify'",
      [req.eid]
    );

    return res.json({
      success: true,
      data: {
        vinculados,
        sin_match: sinMatch,
        total_shopify: allProducts.length,
        productos: detalles,
      },
    });
  } catch (err) {
    console.error('Shopify sync-products error:', err);
    return res.status(500).json({ success: false, error: 'Error al sincronizar productos' });
  }
});

// --------------- POST /api/shopify/pull-orders ---------------

router.post('/pull-orders', async (req, res) => {
  try {
    const integ = await getIntegration(req.eid);
    if (!integ) return res.status(400).json({ success: false, error: 'Shopify no esta conectado' });

    // Determine last sync time (default: 7 days ago)
    const lastSync = integ.ultima_sync
      ? new Date(integ.ultima_sync).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const data = await shopifyGQL(integ.config.store_url, await getTokenForEmpresa(integ), `{
      orders(first: 50, query: "created_at:>'${lastSync}' AND financial_status:paid", sortKey: CREATED_AT) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 50) {
              edges {
                node {
                  sku
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                  title
                }
              }
            }
            customer { firstName lastName email }
          }
        }
      }
    }`);

    const orders = data.orders.edges.map(e => e.node);
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const order of orders) {
      const shopifyOrderId = extractGid(order.id);

      try {
        // Check if already imported
        const existing = await pool.query(
          'SELECT id FROM ventas WHERE shopify_order_id = $1 AND empresa_id = $2',
          [shopifyOrderId, req.eid]
        );
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        const totalAmount = parseFloat(order.totalPriceSet.shopMoney.amount);
        const fecha = order.createdAt.split('T')[0];
        const periodoId = await findPeriodoId(req.eid, fecha);

        // Build items from lineItems
        const items = [];
        let totalCantidad = 0;

        for (const li of order.lineItems.edges) {
          const lineItem = li.node;
          const precio = parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || 0);
          const cantidad = lineItem.quantity || 1;

          // Try to match by SKU
          let productoId = null;
          if (lineItem.sku) {
            const match = await pool.query(
              'SELECT id FROM productos WHERE LOWER(sku) = LOWER($1) AND empresa_id = $2',
              [lineItem.sku, req.eid]
            );
            if (match.rows.length > 0) productoId = match.rows[0].id;
          }

          items.push({
            producto_id: productoId,
            titulo: lineItem.title,
            sku: lineItem.sku,
            cantidad,
            precio_unitario: precio,
            descuento: 0,
            subtotal: precio * cantidad,
          });

          totalCantidad += cantidad;
        }

        const ventaProductoId = items.length === 1 ? items[0].producto_id : null;
        const ventaPrecioUnitario = items.length === 1 ? items[0].precio_unitario : null;

        // Create venta in a transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const ventaResult = await client.query(
            `INSERT INTO ventas (empresa_id, periodo_id, producto_id, fecha, cantidad, precio_unitario, descuento, total, nota, shopify_order_id, canal_id)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, NULL) RETURNING *`,
            [req.eid, periodoId, ventaProductoId, fecha, totalCantidad, ventaPrecioUnitario, totalAmount, `Shopify ${order.name}`, shopifyOrderId]
          );
          const venta = ventaResult.rows[0];

          // Insert venta_items
          for (const item of items) {
            await client.query(
              `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [venta.id, item.producto_id, item.cantidad, item.precio_unitario, item.descuento, item.subtotal]
            );
          }

          await client.query('COMMIT');

          // Deduct stock for matched products (outside transaction)
          for (const item of items) {
            if (item.producto_id) {
              try {
                const prodCheck = await pool.query('SELECT control_stock FROM productos WHERE id = $1', [item.producto_id]);
                if (prodCheck.rows[0]?.control_stock) {
                  await registrarMovimiento(pool, {
                    empresaId: req.eid,
                    productoId: item.producto_id,
                    tipo: 'salida',
                    cantidad: -(item.cantidad),
                    referenciaT: 'venta_shopify',
                    referenciaId: venta.id,
                    nota: `Shopify ${order.name}`,
                    userId: req.uid,
                  });
                }
              } catch (stockErr) {
                console.error(`Stock deduction error for product ${item.producto_id}:`, stockErr.message);
              }
            }
          }

          imported++;
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        } finally {
          client.release();
        }
      } catch (orderErr) {
        console.error(`Error importing Shopify order ${order.name}:`, orderErr.message);
        errors.push({ order: order.name, error: orderErr.message });
      }
    }

    // Update ultima_sync
    await pool.query(
      "UPDATE integraciones SET ultima_sync = NOW() WHERE empresa_id = $1 AND tipo = 'shopify'",
      [req.eid]
    );

    // Log
    await logSync(req.eid, 'pull_orders', errors.length > 0 ? 'partial' : 'ok', { imported, skipped, errors: errors.length });

    return res.json({
      success: true,
      data: { imported, skipped, errors },
    });
  } catch (err) {
    console.error('Shopify pull-orders error:', err);
    return res.status(500).json({ success: false, error: 'Error al importar ordenes' });
  }
});

// --------------- POST /api/shopify/push-stock ---------------

router.post('/push-stock', async (req, res) => {
  try {
    const integ = await getIntegration(req.eid);
    if (!integ) return res.status(400).json({ success: false, error: 'Shopify no esta conectado' });

    const locationGid = integ.config.location_gid;
    if (!locationGid) {
      return res.status(400).json({ success: false, error: 'No se encontro location de Shopify. Reconecta la tienda.' });
    }

    // Get all products with shopify link and stock control
    const productos = await pool.query(
      `SELECT id, nombre, sku, stock_actual, shopify_inventory_item_id
       FROM productos
       WHERE empresa_id = $1 AND shopify_inventory_item_id IS NOT NULL AND control_stock = true`,
      [req.eid]
    );

    let updated = 0;
    const errors = [];

    for (const prod of productos.rows) {
      try {
        const inventoryItemGid = `gid://shopify/InventoryItem/${prod.shopify_inventory_item_id}`;
        const quantity = Math.floor(parseFloat(prod.stock_actual) || 0);

        await shopifyGQL(integ.config.store_url, await getTokenForEmpresa(integ), `
          mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
            inventorySetOnHandQuantities(input: $input) {
              userErrors { field message }
            }
          }
        `, {
          input: {
            reason: 'correction',
            setQuantities: [{
              inventoryItemId: inventoryItemGid,
              locationId: locationGid,
              quantity: quantity,
            }],
          },
        });

        updated++;
      } catch (pushErr) {
        console.error(`Push stock error for ${prod.sku}:`, pushErr.message);
        errors.push({ sku: prod.sku, producto_id: prod.id, error: pushErr.message });
      }
    }

    // Log
    await logSync(req.eid, 'push_stock', errors.length > 0 ? 'partial' : 'ok', { updated, errors: errors.length, total: productos.rows.length });

    return res.json({
      success: true,
      data: { updated, errors, total: productos.rows.length },
    });
  } catch (err) {
    console.error('Shopify push-stock error:', err);
    return res.status(500).json({ success: false, error: 'Error al enviar stock' });
  }
});

// --------------- GET /api/shopify/logs ---------------

router.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sync_log WHERE empresa_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.eid]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Shopify logs error:', err);
    return res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// --------------- Helpers ---------------

async function getIntegration(empresaId) {
  const result = await pool.query(
    "SELECT * FROM integraciones WHERE empresa_id = $1 AND tipo = 'shopify' AND activo = true",
    [empresaId]
  );
  return result.rows[0] || null;
}

async function logSync(empresaId, accion, resultado, detalles = {}) {
  try {
    await pool.query(
      'INSERT INTO sync_log (empresa_id, tipo, accion, resultado, detalles) VALUES ($1, $2, $3, $4, $5)',
      [empresaId, 'shopify', accion, resultado, JSON.stringify(detalles)]
    );
  } catch (err) {
    console.error('Sync log error:', err.message);
  }
}

module.exports = router;
