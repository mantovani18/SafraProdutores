# Safra Agricultores

Aplicação simples de cadastro e consulta de produtores com HTML, CSS, JavaScript, Node.js e PostgreSQL.

## O que ela faz

- Cadastro de produtor com nome completo, cidade, CPF, CNPJ e campos extras.
- Validação de CPF e CNPJ no backend antes de salvar.
- Salvamento dos dados no PostgreSQL.
- Tela separada para listar os produtores já cadastrados.
- Edição e exclusão de produtores pela tela de listagem.

## Estrutura

- `public/index.html` - formulário de cadastro
- `public/lista.html` - listagem dos produtores
- `public/styles.css` - estilos das duas telas
- `public/form.js` - envio do cadastro para a API
- `public/list.js` - leitura e renderização dos produtores em formato de lista expansível
- `server.js` - servidor Node/Express e integração com PostgreSQL
- `sql/schema.sql` - criação das tabelas no banco
- `sql/dados_teste.sql` - registros de exemplo para visualizar a interface

## Edição e exclusão

- Na lista, use `Editar` para abrir o formulário já preenchido.
- Em seguida, salve as alterações para atualizar o registro no banco.
- Use `Excluir` para remover o produtor do PostgreSQL.

## Contratos

- A lista mostra apenas o nome do produtor fechada.
- Ao abrir um produtor, aparecem os demais dados e a área de envio de contrato.
- Ao enviar um arquivo de contrato, o sistema salva o anexo e tenta aproveitar o texto disponível para preencher peso, valor, produto, data e observações quando possível.
- Os arquivos ficam salvos na pasta `uploads/contratos`.

## Como usar

1. Crie um banco no PostgreSQL pelo pgAdmin, por exemplo `safra_agricultores`.
2. Rode o script `sql/schema.sql` nesse banco.
3. Se quiser ver a tela já preenchida, rode também `sql/dados_teste.sql`.
4. Copie `.env.example` para `.env` e ajuste a string de conexão.
5. Instale as dependências com `npm install`.
6. Inicie a aplicação com `npm start`.
7. Acesse `http://localhost:3000` para cadastrar e `http://localhost:3000/lista` para visualizar.

## Acesso à lista

- A tela de cadastro continua livre.
- A lista de produtores agora pede senha antes de abrir.
- Ajuste `LIST_PASSWORD` no arquivo `.env` se quiser trocar a senha padrão.

## Exemplo de `.env`

```env
PORT=3000
DATABASE_URL=postgres://usuario:senha@localhost:5432/safra_agricultores
PGSSLMODE=disable
```

## Observação importante

O pgAdmin não armazena os dados sozinho. Ele é apenas a interface de administração; o cadastro grava no PostgreSQL configurado na variável `DATABASE_URL`.
