import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { writeFile as writeFileAsync, unlink as unlinkAsync } from 'fs/promises';
import multer from 'multer';
import PDFDocument from 'pdfkit';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.FUNCTIONS_WORKER_RUNTIME);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- DATABASE SAFE CONFIG --------------------

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida no ambiente!');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false } // Neon sempre funciona melhor assim no Vercel
});

// -------------------- UPLOAD DIR --------------------

const uploadsDir = isServerless
  ? path.join(os.tmpdir(), 'uploads', 'contratos')
  : path.join(__dirname, 'uploads', 'contratos');

try {
  mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn('Upload dir warning:', err.message);
}

// -------------------- MIDDLEWARE --------------------

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// -------------------- HEALTH CHECK (ESSENCIAL) --------------------

app.get('/healthz', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ ok: false, db: false, error: 'no DATABASE_URL' });
    }

    await pool.query('SELECT 1');
    return res.json({ ok: true, db: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      db: false,
      error: err.message
    });
  }
});

// -------------------- DB INIT SAFE --------------------

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtores (
        id SERIAL PRIMARY KEY,
        nome_completo TEXT,
        cidade TEXT,
        cpf TEXT,
        cnpj TEXT,
        telefone TEXT,
        email TEXT,
        endereco TEXT,
        observacao TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contratos (
        id SERIAL PRIMARY KEY,
        produtor_id INTEGER,
        nome_arquivo TEXT,
        caminho_arquivo TEXT,
        tipo_arquivo TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ DB inicializado');
  } catch (err) {
    console.error('❌ erro init DB:', err.message);
  }
}

initDatabase();

// -------------------- TEST ROUTE --------------------

app.get('/', (_req, res) => {
  res.send('API rodando');
});

// -------------------- PRODUTORES (BÁSICO) --------------------

app.get('/api/produtores', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produtores ORDER BY id DESC');
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

// -------------------- SERVERLESS SAFE EXPORT --------------------

if (!isServerless) {
  app.listen(port, () => {
    console.log(`🚀 Rodando em http://localhost:${port}`);
  });
} else {
  console.log('⚡ Serverless mode (Vercel)');
}

export default app;