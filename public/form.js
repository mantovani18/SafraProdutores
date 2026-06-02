const form = document.getElementById('producerForm');
const message = document.getElementById('message');
const submitButton = form.querySelector('button[type="submit"]');
const cpfField = form.elements.namedItem('cpf');
const cnpjField = form.elements.namedItem('cnpj');
const telefoneField = form.elements.namedItem('telefone');

const editId = new URLSearchParams(window.location.search).get('edit');

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function fillForm(data) {
  for (const [key, value] of Object.entries(data)) {
    const field = form.elements.namedItem(key);

    if (field) {
      field.value = value ?? '';
    }
  }
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function maskCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function maskCnpj(value) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/\/(\d{4})(\d)/, '/$1-$2');
}

function maskTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^(\(\d{2}\) \d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^(\(\d{2}\) \d{5})(\d)/, '$1-$2');
}

cpfField.addEventListener('input', (event) => {
  cpfField.value = maskCpf(event.target.value);
});

cnpjField.addEventListener('input', (event) => {
  cnpjField.value = maskCnpj(event.target.value);
});

telefoneField.addEventListener('input', (event) => {
  telefoneField.value = maskTelefone(event.target.value);
});

async function loadProducerForEdit(id) {
  try {
    const response = await fetch(`/api/produtores/${id}`);

    if (response.status === 401) {
      window.location.href = '/lista';
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Falha ao carregar o produtor para edição.');
    }

    fillForm(data);
    submitButton.textContent = 'Salvar alterações';
    setMessage(`Editando produtor ID ${id}.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Salvando...');

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(editId ? `/api/produtores/${editId}` : '/api/produtores', {
      method: editId ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Falha ao salvar produtor.');
    }

    form.reset();
    if (editId) {
      window.location.href = '/lista';
      return;
    }

    setMessage(`Produtor salvo com sucesso. ID ${data.id}.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

if (editId) {
  loadProducerForEdit(editId);
}