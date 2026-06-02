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

dotenv.config({ override: true });

const app = express();
const port = process.env.PORT || 3000;
const listPassword = process.env.LIST_PASSWORD || '1804';
const listAccessTokens = new Set();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// When running on serverless platforms (Vercel) the project filesystem is mostly
// read-only. Use the OS temp directory for uploads in that environment so
// mkdirSync doesn't fail at module init time and functions don't crash.
const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || Boolean(process.env.FUNCTIONS_WORKER_RUNTIME);
const uploadsDir = isServerless
  ? path.join(os.tmpdir(), 'uploads', 'contratos')
  : path.join(__dirname, 'uploads', 'contratos');

const contractUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

try {
  mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn('Could not create uploads directory, using temp or existing path:', uploadsDir, err && err.message ? err.message : err);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

function getDatabaseNameFromUrl(connectionString) {
  try {
    return new URL(connectionString).pathname.replace(/^\//, '') || '(unknown)';
  } catch {
    return '(invalid connection string)';
  }
}

console.log('PostgreSQL DB:', getDatabaseNameFromUrl(process.env.DATABASE_URL || ''));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (req.path === '/lista.html') {
    return requireListPageAccess(req, res, next);
  }

  if (req.path === '/login.html') {
    return res.redirect('/login');
  }

  return next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve logo and other top-level images from /img
app.use('/img', express.static(path.join(__dirname, 'img')));

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS produtores (
      id SERIAL PRIMARY KEY,
      nome_completo VARCHAR(200) NOT NULL,
      cidade VARCHAR(120) NOT NULL,
      cpf VARCHAR(20),
      cnpj VARCHAR(20),
      telefone VARCHAR(30),
      email VARCHAR(150),
      endereco TEXT,
      observacao TEXT,
      data_emissao TEXT,
      data_entrada TEXT,
      nota_fiscal TEXT,
      razao_social TEXT,
      uf_origem TEXT,
      descricao TEXT,
      quantidade TEXT,
      valor_unitario TEXT,
      valor_liquido_item TEXT,
      frete TEXT,
      valor_total_item TEXT,
      numero_oc TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE produtores
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
  `);

  for (const field of producerExtraFields) {
    await pool.query(`ALTER TABLE produtores ADD COLUMN IF NOT EXISTS ${field} TEXT;`);
  }

  try {
    await syncProducerIdSequence();
  } catch (err) {
    console.warn('Falha ao sincronizar sequência de produtores.id:', err && err.message ? err.message : err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contratos (
      id SERIAL PRIMARY KEY,
      produtor_id INTEGER NOT NULL REFERENCES produtores(id) ON DELETE CASCADE,
      nome_arquivo TEXT NOT NULL,
      caminho_arquivo TEXT NOT NULL,
      tipo_arquivo TEXT NOT NULL,
      texto_extraido TEXT,
      produto TEXT,
      peso TEXT,
      peso_valor NUMERIC(12, 3),
      valor TEXT,
      valor_total NUMERIC(12, 2),
      data_contrato DATE,
      observacoes TEXT,
      dados_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isRepeatedDigits(value) {
  return /^([0-9])\1+$/.test(value);
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || isRepeatedDigits(cpf)) {
    return false;
  }

  const digits = cpf.split('').map(Number);
  const firstSum = digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0);
  const firstCheck = (firstSum * 10) % 11;
  const firstDigit = firstCheck === 10 ? 0 : firstCheck;

  if (firstDigit !== digits[9]) {
    return false;
  }

  const secondSum = digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0);
  const secondCheck = (secondSum * 10) % 11;
  const secondDigit = secondCheck === 10 ? 0 : secondCheck;

  return secondDigit === digits[10];
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || isRepeatedDigits(cnpj)) {
    return false;
  }

  const digits = cnpj.split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, ...weights1];

  const sum1 = digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * weights1[index], 0);
  const rest1 = sum1 % 11;
  const firstDigit = rest1 < 2 ? 0 : 11 - rest1;

  if (firstDigit !== digits[12]) {
    return false;
  }

  const sum2 = digits.slice(0, 13).reduce((sum, digit, index) => sum + digit * weights2[index], 0);
  const rest2 = sum2 % 11;
  const secondDigit = rest2 < 2 ? 0 : 11 - rest2;

  return secondDigit === digits[13];
}

function validateDocument(cpf, cnpj) {
  if (!cpf && !cnpj) {
    return 'Informe CPF ou CNPJ.';
  }

  if (cpf && !isValidCpf(cpf)) {
    return 'CPF inválido.';
  }

  if (cnpj && !isValidCnpj(cnpj)) {
    return 'CNPJ inválido.';
  }

  return null;
}

const producerExtraFields = [
  'conta_para_deposito',
  'data_emissao',
  'data_entrada',
  'nota_fiscal',
  'razao_social',
  'uf_origem',
  'descricao',
  'quantidade',
  'valor_unitario',
  'valor_liquido_item',
  'frete',
  'valor_total_item',
  'numero_oc'
]

const producerSelectColumns = [
  'id',
  'nome_completo',
  'cidade',
  'cpf',
  'cnpj',
  'telefone',
  'email',
  'endereco',
  'observacao',
  ...producerExtraFields,
  'created_at',
  'updated_at'
].join(', ')

function normalizeProducerPayload(body) {
  const payload = {
    nome_completo: normalizeText(body.nome_completo),
    cidade: normalizeText(body.cidade),
    cpf: normalizeText(body.cpf),
    cnpj: normalizeText(body.cnpj),
    telefone: normalizeText(body.telefone),
    email: normalizeText(body.email),
    endereco: normalizeText(body.endereco),
    observacao: normalizeText(body.observacao)
  }

  for (const field of producerExtraFields) {
    payload[field] = normalizeText(body[field]);
  }

  return payload;
}

function mapProducer(row) {
  const producer = {
    id: row.id,
    nome_completo: row.nome_completo,
    cidade: row.cidade,
    cpf: row.cpf,
    cnpj: row.cnpj,
    telefone: row.telefone,
    email: row.email,
    endereco: row.endereco,
    observacao: row.observacao,
    created_at: row.created_at,
    updated_at: row.updated_at
  };

  for (const field of producerExtraFields) {
    producer[field] = row[field];
  }

  return producer;
}

async function syncProducerIdSequence() {
  const sequenceResult = await pool.query("SELECT pg_get_serial_sequence('produtores', 'id') AS sequence_name");
  const sequenceName = sequenceResult.rows[0]?.sequence_name;

  if (!sequenceName) {
    return;
  }

  await pool.query(
    "SELECT setval(pg_get_serial_sequence('produtores', 'id'), COALESCE((SELECT MAX(id) FROM produtores), 0), true);"
  );
}

function formatProducerPdfValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (field === 'data_emissao' || field === 'data_entrada') {
    const parsedDate = parseDateValue(value) || new Date(value);

    if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString('pt-BR');
    }
  }

  if (field === 'quantidade') {
    const parsedQuantity = parseNumberValue(value);

    if (parsedQuantity !== null) {
      return formatNumberValue(parsedQuantity, 3);
    }
  }

  if (field === 'valor_unitario' || field === 'valor_liquido_item' || field === 'frete' || field === 'valor_total_item') {
    const parsedCurrency = parseNumberValue(value);

    if (parsedCurrency !== null) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(parsedCurrency);
    }
  }

  return String(value);
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const [day, month, year] = value.split('/').map(Number);

  if (!day || !month || !year) {
    return null;
  }

  const parsedDate = new Date(year, month - 1, day);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function parseNumberValue(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumberValue(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value));
}

async function extractContractText(file) {
  try {
    return file.buffer.toString('utf8');
  } catch (error) {
    console.error('Falha ao ler o contrato:', error);
    return '';
  }
}

function parseContractData(text) {
  const normalizedText = String(text || '').replace(/\r/g, '\n');
  const compactText = normalizedText.replace(/\s+/g, ' ').trim();
  const productMatch = compactText.match(/(?:produto|mercadoria|item)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9 ,.-]{3,80})/i);
  const weightMatch = compactText.match(/(?:peso|qtde|quantidade)\D{0,20}(\d{1,4}(?:[.,]\d{1,3})?)(?:\s*(kg|quilo|quilos|t|ton|toneladas?))?/i);
  const valueMatch = compactText.match(/(?:valor|pre[çc]o|total|import[âa]ncia)\D{0,20}(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/i);
  const dateMatch = compactText.match(/(\d{2}\/\d{2}\/\d{4})/);

  const product = productMatch?.[1]?.trim() || null;
  const peso = weightMatch?.[1] || null;
  const valor = valueMatch?.[1] || null;
  const dataContrato = dateMatch?.[1] || null;

  return {
    product,
    peso,
    pesoValor: parseNumberValue(peso),
    valor,
    valorTotal: parseNumberValue(valor),
    dataContrato: parseDateValue(dataContrato),
    observacoes: compactText.slice(0, 500) || null,
    rawText: normalizedText
  };
}

function getCookieValue(req, name) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(name.length + 1));
}

function getBasicAuthPassword(req) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.toLowerCase().startsWith('basic ')) {
    return null;
  }

  const encodedCredentials = authorization.slice(6).trim();

  try {
    const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) {
      return null;
    }

    return decoded.slice(separatorIndex + 1);
  } catch {
    return null;
  }
}

function hasListAccess(req) {
  const token = getCookieValue(req, 'list_access_token');
  const basicAuthPassword = getBasicAuthPassword(req);

  if (token && listAccessTokens.has(token)) {
    return true;
  }

  return basicAuthPassword === listPassword;
}

function sendListAuthChallenge(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Produtores", charset="UTF-8"');
  return res.status(401).send('Autenticação necessária.');
}

function requireListPageAccess(req, res, next) {
  if (!hasListAccess(req)) {
    return sendListAuthChallenge(res);
  }

  return next();
}

function requireListApiAccess(req, res, next) {
  if (!hasListAccess(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Produtores", charset="UTF-8"');
    return res.status(401).json({ message: 'Acesso restrito.' });
  }

  return next();
}

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const password = normalizeText(req.body.password);

  if (!password || password !== listPassword) {
    return res.status(401).json({ message: 'Senha incorreta.' });
  }

  const token = randomUUID();
  listAccessTokens.add(token);

  res.setHeader('Set-Cookie', `list_access_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
  res.json({ ok: true, redirect: '/lista' });
});

app.post('/logout', (req, res) => {
  const token = getCookieValue(req, 'list_access_token');

  if (token) {
    listAccessTokens.delete(token);
  }

  res.setHeader('Set-Cookie', 'list_access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true, redirect: '/login' });
});

app.get('/api/produtores', requireListApiAccess, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${producerSelectColumns}
       FROM produtores
       ORDER BY created_at DESC, id DESC`
    );
    res.json(result.rows.map(mapProducer));
  } catch (error) {
    console.error('Erro ao buscar produtores:', error);
    res.status(500).json({ message: 'Erro ao buscar produtores.' });
  }
});

app.get('/api/produtores/:id', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const result = await pool.query(
      `SELECT ${producerSelectColumns}
       FROM produtores
       WHERE id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    res.json(mapProducer(result.rows[0]));
  } catch (error) {
    console.error('Erro ao buscar produtor:', error);
    res.status(500).json({ message: 'Erro ao buscar produtor.' });
  }
});

app.get('/api/produtores/:id/contratos', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const result = await pool.query(
      `SELECT id, produtor_id, nome_arquivo, caminho_arquivo, tipo_arquivo, created_at
       FROM contratos
       WHERE produtor_id = $1
       ORDER BY created_at DESC, id DESC`,
      [id]
    );

    res.json(result.rows.map((row) => ({
      id: row.id,
      produtor_id: row.produtor_id,
      nome_arquivo: row.nome_arquivo,
      caminho_arquivo: row.caminho_arquivo,
      tipo_arquivo: row.tipo_arquivo,
      created_at: row.created_at
    })));
  } catch (error) {
    console.error('Erro ao buscar contratos:', error);
    res.status(500).json({ message: 'Erro ao buscar contratos.' });
  }
});

app.post('/api/produtores/:id/contratos', requireListApiAccess, contractUpload.single('contract_file'), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const producerResult = await pool.query('SELECT id FROM produtores WHERE id = $1', [id]);

    if (!producerResult.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Envie um arquivo de contrato.' });
    }

    const storedFileName = `${Date.now()}-${randomUUID()}${path.extname(file.originalname) || ''}`;
    const storedFilePath = path.join(uploadsDir, storedFileName);

    await writeFileAsync(storedFilePath, file.buffer);

    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Envie apenas uma foto do contrato.' });
    }

    const result = await pool.query(
      `INSERT INTO contratos (
        produtor_id,
        nome_arquivo,
        caminho_arquivo,
        tipo_arquivo,
        texto_extraido,
        dados_extraidos
      )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, produtor_id, nome_arquivo, caminho_arquivo, tipo_arquivo, texto_extraido, dados_extraidos, created_at`,
      [
        id,
        file.originalname,
        `/uploads/contratos/${storedFileName}`,
        file.mimetype,
        null,
        JSON.stringify({ uploaded_at: new Date().toISOString() })
      ]
    );

    res.status(201).json({ contract: result.rows[0] });
  } catch (error) {
    console.error('Erro ao salvar contrato:', error);
    res.status(500).json({ message: 'Erro ao salvar contrato.' });
  }
});

// Contracts are file-only attachments; keep this route for compatibility.
app.put('/api/produtores/:id/contratos/:contractId', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contractId = Number(req.params.contractId);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const producerResult = await pool.query('SELECT id FROM produtores WHERE id = $1', [id]);

    if (!producerResult.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    const contractResult = await pool.query('SELECT id FROM contratos WHERE id = $1 AND produtor_id = $2', [contractId, id]);

    if (!contractResult.rows.length) {
      return res.status(404).json({ message: 'Contrato não encontrado para este produtor.' });
    }

    const result = await pool.query(
      `SELECT id, produtor_id, nome_arquivo, caminho_arquivo, tipo_arquivo, texto_extraido, dados_extraidos, created_at
       FROM contratos
       WHERE id = $1 AND produtor_id = $2`,
      [contractId, id]
    );

    res.json({ contract: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar contrato:', error);
    res.status(500).json({ message: 'Erro ao atualizar contrato.' });
  }
});

// Delete a contract and its file from disk
app.delete('/api/produtores/:id/contratos/:contractId', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contractId = Number(req.params.contractId);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const contractResult = await pool.query('SELECT id, caminho_arquivo FROM contratos WHERE id = $1 AND produtor_id = $2', [contractId, id]);

    if (!contractResult.rows.length) {
      return res.status(404).json({ message: 'Contrato não encontrado para este produtor.' });
    }

    const caminho = contractResult.rows[0].caminho_arquivo;

    await pool.query('DELETE FROM contratos WHERE id = $1 AND produtor_id = $2', [contractId, id]);

    if (caminho) {
      const relative = caminho.replace(/^\//, '');
      const fullPath = path.join(__dirname, relative);
      try {
        await unlinkAsync(fullPath);
      } catch (err) {
        console.warn('Falha ao remover arquivo do contrato:', err.message || err);
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir contrato:', error);
    res.status(500).json({ message: 'Erro ao excluir contrato.' });
  }
});

// Generate a PDF with all producer data and contracts
app.get('/api/produtores/:id/pdf', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const producerResult = await pool.query(
      `SELECT ${producerSelectColumns}
       FROM produtores WHERE id = $1`,
      [id]
    );

    if (!producerResult.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    const producer = producerResult.rows[0];

    const contractsResult = await pool.query(
      `SELECT id, nome_arquivo, caminho_arquivo, tipo_arquivo, created_at
       FROM contratos WHERE produtor_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="produtor-${id}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text('Ficha do Produtor', { align: 'center' });
    doc.moveDown();

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnGap = 18;
    const columnWidth = (pageWidth - columnGap) / 2;
    const pdfFieldNameMap = {
      Nome: 'nome_completo',
      Cidade: 'cidade',
      CPF: 'cpf',
      CNPJ: 'cnpj',
      Telefone: 'telefone',
      Email: 'email',
      Endereço: 'endereco',
      'Conta para depósito': 'conta_para_deposito',
      Observações: 'observacao',
      'Data emissão': 'data_emissao',
      'Data entrada': 'data_entrada',
      'Nota Fiscal': 'nota_fiscal',
      'Razão Social': 'razao_social',
      'UF Origem': 'uf_origem',
      Descrição: 'descricao',
      Quantidade: 'quantidade',
      'Valor unitário': 'valor_unitario',
      'Valor líquido item': 'valor_liquido_item',
      Frete: 'frete',
      'Valor total do item': 'valor_total_item',
      'Número O.C.': 'numero_oc'
    };
    const sections = [
      {
        title: 'Dados do produtor',
        fields: [
          ['Nome', producer.nome_completo],
          ['Cidade', producer.cidade],
          ['CPF', producer.cpf],
          ['CNPJ', producer.cnpj],
          ['Telefone', producer.telefone],
          ['Email', producer.email],
          ['Endereço', producer.endereco],
          ['Conta para depósito', producer.conta_para_deposito],
          ['Observações', producer.observacao]
        ]
      },
      {
        title: 'Dados do produto / nota',
        fields: [
          ['Data emissão', producer.data_emissao],
          ['Data entrada', producer.data_entrada],
          ['Nota Fiscal', producer.nota_fiscal],
          ['Razão Social', producer.razao_social],
          ['UF Origem', producer.uf_origem],
          ['Descrição', producer.descricao],
          ['Quantidade', producer.quantidade],
          ['Valor unitário', producer.valor_unitario],
          ['Valor líquido item', producer.valor_liquido_item],
          ['Frete', producer.frete],
          ['Valor total do item', producer.valor_total_item],
          ['Número O.C.', producer.numero_oc]
        ]
      }
    ];

    const drawSectionTitle = (title) => {
      const x = doc.page.margins.left;
      const y = doc.y;
      doc.save();
      doc.roundedRect(x, y, pageWidth, 22, 8).fill('#2f6c44');
      doc.restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), x + 12, y + 6);
      doc.moveDown(1.35);
      doc.fillColor('#1d2a22');
    };

    const drawFieldCell = (x, y, width, label, value) => {
      const fieldName = pdfFieldNameMap[label] || String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const displayValue = formatProducerPdfValue(fieldName, value);
      doc.fillColor('#6b6657').font('Helvetica-Bold').fontSize(9).text(label, x, y, { width });
      const valueY = y + 12;
      doc.fillColor('#1d2a22').font('Helvetica').fontSize(10).text(displayValue, x, valueY, { width });
      return doc.heightOfString(displayValue, { width }) + 18;
    };

    const drawFieldGrid = (fields) => {
      for (let index = 0; index < fields.length; index += 2) {
        const left = fields[index];
        const right = fields[index + 1];
        const startY = doc.y;
        const leftHeight = drawFieldCell(doc.page.margins.left, startY, columnWidth, left[0], left[1]);
        const rightHeight = right ? drawFieldCell(doc.page.margins.left + columnWidth + columnGap, startY, columnWidth, right[0], right[1]) : 0;
        doc.y = startY + Math.max(leftHeight, rightHeight || 0) + 8;
      }
    };

    for (const section of sections) {
      drawSectionTitle(section.title);
      drawFieldGrid(section.fields);
      doc.moveDown(0.5);
    }
      doc.fillColor('#6b6657').font('Helvetica-Bold').fontSize(9).text('ID: ', { continued: true });
      doc.fillColor('#1d2a22').font('Helvetica').fontSize(10).text(String(producer.id));
      doc.fillColor('#6b6657').font('Helvetica-Bold').fontSize(9).text('Criado em: ', { continued: true });
      doc.fillColor('#1d2a22').font('Helvetica').fontSize(10).text(producer.created_at ? new Date(producer.created_at).toLocaleString('pt-BR') : '-');
      doc.fillColor('#6b6657').font('Helvetica-Bold').fontSize(9).text('Atualizado em: ', { continued: true });
      doc.fillColor('#1d2a22').font('Helvetica').fontSize(10).text(producer.updated_at ? new Date(producer.updated_at).toLocaleString('pt-BR') : '-');

      // Contratos não são exibidos no PDF por solicitação do usuário; permanecem anexados no sistema.

    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF do produtor:', error);
    res.status(500).json({ message: 'Erro ao gerar PDF.' });
  }
});

app.post('/api/produtores', async (req, res) => {
  try {
    const payload = normalizeProducerPayload(req.body);
    console.log('POST /api/produtores payload:', payload);
    const nomeCompleto = payload.nome_completo;
    const cidade = payload.cidade;
    const cpf = payload.cpf;
    const cnpj = payload.cnpj;

    if (!nomeCompleto || !cidade) {
      console.log('Validation failed: missing nome_completo or cidade', { nome_completo: nomeCompleto, cidade });
      return res.status(400).json({ message: 'Nome completo e cidade são obrigatórios.' });
    }

    const documentError = validateDocument(cpf, cnpj);

    if (documentError) {
      console.log('Validation failed: document error', { documentError, cpf, cnpj });
      return res.status(400).json({ message: documentError });
    }

    const insertColumns = ['nome_completo', 'cidade', 'cpf', 'cnpj', 'telefone', 'email', 'endereco', 'observacao', ...producerExtraFields];
    const insertValues = insertColumns.map((field) => {
      const value = payload[field];
      return value || null;
    });
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');

    await syncProducerIdSequence();

    const insertSql = `INSERT INTO produtores (${insertColumns.join(', ')})\n       VALUES (${placeholders})\n       RETURNING ${producerSelectColumns}`;
    console.log('Executing INSERT:', insertSql);
    console.log('Insert values:', insertValues);
    let result;

    try {
      result = await pool.query(insertSql, insertValues);
    } catch (error) {
      if (error && error.code === '23505') {
        console.warn('Duplicate key on produtores insert, resyncing sequence and retrying once.');
        await syncProducerIdSequence();
        result = await pool.query(insertSql, insertValues);
      } else {
        throw error;
      }
    }

    console.log('Inserted producer result:', result.rows[0]);

    res.status(201).json(mapProducer(result.rows[0]));
  } catch (error) {
    console.error('Erro ao salvar produtor:', error);
    res.status(500).json({ message: error.message || 'Erro ao salvar produtor.' });
  }
});

app.put('/api/produtores/:id', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const payload = normalizeProducerPayload(req.body);
    const nomeCompleto = payload.nome_completo;
    const cidade = payload.cidade;
    const cpf = payload.cpf;
    const cnpj = payload.cnpj;

    if (!nomeCompleto || !cidade) {
      return res.status(400).json({ message: 'Nome completo e cidade são obrigatórios.' });
    }

    const documentError = validateDocument(cpf, cnpj);

    if (documentError) {
      return res.status(400).json({ message: documentError });
    }

    const updateColumns = ['nome_completo', 'cidade', 'cpf', 'cnpj', 'telefone', 'email', 'endereco', 'observacao', ...producerExtraFields];
    const setClause = updateColumns.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const updateValues = updateColumns.map((field) => {
      const value = payload[field];
      return value || null;
    });

    const result = await pool.query(
      `UPDATE produtores
       SET ${setClause},
           updated_at = NOW()
       WHERE id = $${updateColumns.length + 1}
       RETURNING ${producerSelectColumns}`,
      [...updateValues, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    res.json(mapProducer(result.rows[0]));
  } catch (error) {
    console.error('Erro ao atualizar produtor:', error);
    res.status(500).json({ message: error.message || 'Erro ao atualizar produtor.' });
  }
});

app.delete('/api/produtores/:id', requireListApiAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const result = await pool.query('DELETE FROM produtores WHERE id = $1 RETURNING id', [id]);

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Produtor não encontrado.' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir produtor:', error);
    res.status(500).json({ message: 'Erro ao excluir produtor.' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/lista', requireListPageAccess, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lista.html'));
});

// Initialize database but don't crash the process on failure (serverless environments
// should not exit — allow static assets to be served even if DB is temporarily unavailable).
initDatabase().catch((error) => {
  console.error('Falha ao inicializar o banco de dados:', error && error.message ? error.message : error);
});

if (!isServerless) {
  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });
} else {
  console.log('Running in serverless mode; not calling app.listen()');
}

// Export app for serverless platforms to mount (Vercel / other adapters will use this).
export default app;