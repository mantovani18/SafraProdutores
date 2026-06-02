TRUNCATE TABLE contratos, produtores RESTART IDENTITY CASCADE;

INSERT INTO produtores (
  id,
  nome_completo,
  cidade,
  cpf,
  cnpj,
  telefone,
  email,
  endereco,
  observacao,
  created_at,
  updated_at
) VALUES
(1, 'João Pedro Almeida', 'Sorriso', '123.456.789-09', NULL, '(66) 99999-1111', 'joao.almeida@email.com', 'Fazenda Santa Luzia, km 12', 'Produtor de soja e milho', NOW(), NOW()),
(2, 'Maria Aparecida Santos', 'Lucas do Rio Verde', NULL, '12.345.678/0001-90', '(65) 98888-2222', 'contato@mariasantos.com', 'Assentamento São Jorge, lote 14', 'Produtora de algodão', NOW(), NOW()),
(3, 'Cooperativa Agro Novo Campo', 'Primavera do Leste', NULL, '98.765.432/0001-10', '(66) 97777-3333', 'financeiro@novocampo.coop.br', 'Av. Brasil, 1200, Centro', 'Atendimento para múltiplos produtores', NOW(), NOW());

INSERT INTO contratos (
  produtor_id,
  nome_arquivo,
  caminho_arquivo,
  tipo_arquivo,
  texto_extraido,
  produto,
  peso,
  peso_valor,
  valor,
  valor_total,
  data_contrato,
  observacoes,
  dados_extraidos,
  created_at
) VALUES
(1, 'contrato-soja-joao.pdf', '/uploads/contratos/contrato-soja-joao.pdf', 'application/pdf', 'Contrato de soja com entrega prevista de 1.250 sacas e valor total de R$ 175.000,00.', 'Soja', '1.250 sacas', 1250.000, 'R$ 175.000,00', 175000.00, '2026-05-12', 'Contrato exemplo para visualização da tela.', '{"produto":"Soja","peso":"1.250 sacas","valor":"R$ 175.000,00","data_contrato":"2026-05-12"}', NOW()),
(2, 'contrato-algodao-maria.jpg', '/uploads/contratos/contrato-algodao-maria.jpg', 'image/jpeg', 'Entregue algodão com peso aproximado de 820 arrobas e valor final de R$ 96.400,00.', 'Algodão', '820 arrobas', 820.000, 'R$ 96.400,00', 96400.00, '2026-05-18', 'Arquivo de exemplo para teste visual.', '{"produto":"Algodão","peso":"820 arrobas","valor":"R$ 96.400,00","data_contrato":"2026-05-18"}', NOW()),
(3, 'contrato-multiprodutores-coop.pdf', '/uploads/contratos/contrato-multiprodutores-coop.pdf', 'application/pdf', 'Contrato cooperativo com volume de 3.500 toneladas e valor total de R$ 4.850.000,00.', 'Grãos diversos', '3.500 toneladas', 3500.000, 'R$ 4.850.000,00', 4850000.00, '2026-05-20', 'Exemplo de contrato corporativo.', '{"produto":"Grãos diversos","peso":"3.500 toneladas","valor":"R$ 4.850.000,00","data_contrato":"2026-05-20"}', NOW());