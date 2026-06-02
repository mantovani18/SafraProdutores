import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- DATABASE ----------------

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------------- UPLOAD DIR SAFE ----------------

const uploadsDir = isServerless
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, 'uploads');

try {
  mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
  console.warn('Upload dir warning:', e.message);
}

// ---------------- MIDDLEWARE ----------------

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// IMPORTANTE: permite frontend funcionar na Vercel
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- HEALTH ----------------

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------- HOME ----------------

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔥 ISSO AQUI É O QUE ESTAVA TE QUEBRANDO
app.get('/lista', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lista.html'));
});

// ---------------- API ----------------

app.get('/api/produtores', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM produtores ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtores', async (req, res) => {
  try {
    const { nome_completo, cidade } = req.body;

    if (!nome_completo || !cidade) {
      return res.status(400).json({ error: 'Campos obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO produtores (nome_completo, cidade)
       VALUES ($1, $2)
       RETURNING *`,
      [nome_completo, cidade]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- SERVERLESS EXPORT ----------------

if (!isServerless) {
  app.listen(port, () => {
    console.log(`🚀 Local: http://localhost:${port}`);
  });
} else {
  console.log('⚡ Serverless mode (Vercel)');
}

export default app;