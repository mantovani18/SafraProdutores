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
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

