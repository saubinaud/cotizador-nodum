const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const auth = require('../middleware/auth');
const pool = require('../models/db');
const crypto = require('crypto');

const router = express.Router();
router.use(auth);

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes'));
  },
});

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || 'https://57245a76594bd8d9fa2eaae56f841903.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
}

const BUCKET = process.env.R2_BUCKET || 'kudi';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://57245a76594bd8d9fa2eaae56f841903.r2.cloudflarestorage.com/${BUCKET}`;

// POST /api/upload/producto/:id — upload product image
router.post('/producto/:id', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Imagen requerida' });

    // Verify product belongs to empresa
    const prod = await pool.query('SELECT id, imagen_url FROM productos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.eid]);
    if (prod.rows.length === 0) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    // Generate unique key
    const ext = req.file.mimetype.split('/')[1] || 'jpg';
    const key = `productos/${req.eid}/${req.params.id}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    // Upload to R2
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const imageUrl = `${PUBLIC_URL}/${key}`;

    // Delete old image if exists
    const oldUrl = prod.rows[0].imagen_url;
    if (oldUrl && oldUrl.includes(BUCKET)) {
      try {
        const oldKey = oldUrl.split(`${BUCKET}/`)[1];
        if (oldKey) await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }));
      } catch (_) {}
    }

    // Update product
    await pool.query('UPDATE productos SET imagen_url = $1, updated_at = NOW() WHERE id = $2', [imageUrl, req.params.id]);

    return res.json({ success: true, data: { url: imageUrl } });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ success: false, error: 'Error subiendo imagen' });
  }
});

// POST /api/upload/logo — upload empresa logo
router.post('/logo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Imagen requerida' });

    const ext = req.file.mimetype.split('/')[1] || 'png';
    const key = `logos/${req.eid}/logo-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const logoUrl = `${PUBLIC_URL}/${key}`;

    // Update user logo
    await pool.query('UPDATE usuarios SET logo_url = $1 WHERE id = $2', [logoUrl, req.uid]);

    return res.json({ success: true, data: { url: logoUrl } });
  } catch (err) {
    console.error('Logo upload error:', err);
    return res.status(500).json({ success: false, error: 'Error subiendo logo' });
  }
});

module.exports = router;
