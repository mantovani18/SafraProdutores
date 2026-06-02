import http from 'http';

const data = JSON.stringify({
  nome_completo: 'Teste Exemplo',
  cidade: 'Cidade Teste',
  cpf: '529.982.247-25',
  conta_para_deposito: 'Banco X - 12345/6789'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/produtores',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => { process.stdout.write(chunk); body += chunk; });
  res.on('end', () => { console.log('\n--- END ---'); });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
