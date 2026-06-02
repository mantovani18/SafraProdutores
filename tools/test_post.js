import http from 'http';

const data = JSON.stringify({
  nome_completo: 'Teste Exemplo',
  cidade: 'São Paulo'
});

const options = {
  hostname: process.env.HOST || 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/produtores',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Resposta:', body);
  });
});

req.on('error', (err) => {
  console.error('Erro:', err.message);
});

req.write(data);
req.end();