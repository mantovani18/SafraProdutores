const producerList = document.getElementById('producerList');
const countText = document.getElementById('countText');
const searchInput = document.getElementById('searchInput');
const refreshButton = document.getElementById('refreshButton');
const logoutButton = document.getElementById('logoutButton');

const producerNoteFieldConfigs = [
  { field: 'data_emissao', label: 'Data emissão', placeholder: 'dd/mm/aaaa' },
  { field: 'data_entrada', label: 'Data entrada', placeholder: 'dd/mm/aaaa' },
  { field: 'nota_fiscal', label: 'Nota Fiscal', placeholder: 'Número da nota' },
  { field: 'razao_social', label: 'Razão Social', placeholder: 'Razão social do destinatário', span: 'span-2' },
  { field: 'uf_origem', label: 'UF Origem', placeholder: 'UF' },
  { field: 'descricao', label: 'Descrição', placeholder: 'Descrição do item', textarea: true, rows: 3, span: 'span-full' },
  { field: 'quantidade', label: 'Quantidade', placeholder: '0' },
  { field: 'valor_unitario', label: 'Valor unitário', placeholder: '0,00' },
  { field: 'valor_liquido_item', label: 'Valor líquido item', placeholder: '0,00' },
  { field: 'frete', label: 'Frete', placeholder: '0,00' },
  { field: 'valor_total_item', label: 'Valor total do item', placeholder: '0,00' },
  { field: 'numero_oc', label: 'Número O.C.', placeholder: 'Número da ordem de compra' }
];

let cachedProducers = [];
const loadedContracts = new Set();

async function readApiPayload(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  return {
    message: text || 'Resposta inesperada do servidor.'
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) return '-';

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(parsedDate);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return escapeHtml(value);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numericValue);
}

function formatWeight(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return escapeHtml(value);
  }

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(numericValue);
}

function filterProducers(producers, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return producers;
  }

  return producers.filter((producer) => {
    const searchableText = [
      producer.nome_completo,
      producer.cidade,
      producer.cpf,
      producer.cnpj,
      producer.telefone,
      producer.email,
      producer.endereco,
      producer.conta_para_deposito,
      producer.observacao,
      producer.data_emissao,
      producer.data_entrada,
      producer.nota_fiscal,
      producer.razao_social,
      producer.uf_origem,
      producer.descricao,
      producer.quantidade,
      producer.valor_unitario,
      producer.valor_liquido_item,
      producer.frete,
      producer.valor_total_item,
      producer.numero_oc
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

function buildProducerCard(producer) {
  const documentos = [producer.cpf, producer.cnpj].filter(Boolean).join(' / ') || '-';

  const productFields = producerNoteFieldConfigs.map((config) => {
    const value = escapeHtml(producer[config.field] || '');
    const classes = ['detail-item'];

    if (config.span === 'span-2') {
      classes.push('detail-item-wide');
    }

    if (config.span === 'span-full') {
      classes.push('detail-item-full');
    }

    if (config.textarea) {
      return `
        <label class="${classes.join(' ')}">
          <span class="detail-label">${escapeHtml(config.label)}</span>
          <textarea class="editable-input" data-field="${escapeHtml(config.field)}" aria-label="${escapeHtml(config.label)}" rows="${config.rows || 2}" placeholder="${escapeHtml(config.placeholder || '')}">${value}</textarea>
        </label>
      `;
    }

    return `
      <label class="${classes.join(' ')}">
        <span class="detail-label">${escapeHtml(config.label)}</span>
        <input class="editable-input" data-field="${escapeHtml(config.field)}" aria-label="${escapeHtml(config.label)}" value="${value}" placeholder="${escapeHtml(config.placeholder || '')}" />
      </label>
    `;
  }).join('');

  return `
    <details class="producer-card" data-producer-id="${escapeHtml(producer.id)}">
      <summary class="producer-summary">
        <span class="producer-summary-name">${escapeHtml(producer.nome_completo)}</span>
      </summary>
      <div class="producer-panel">
        <div class="producer-detail-grid">
          <div class="detail-item detail-item-wide">
            <span class="detail-label">Nome completo</span>
            <input class="editable-input" data-field="nome_completo" aria-label="Nome completo" value="${escapeHtml(producer.nome_completo || '')}" />
          </div>
          <div class="detail-item">
            <span class="detail-label">Cidade</span>
            <input class="editable-input" data-field="cidade" aria-label="Cidade" value="${escapeHtml(producer.cidade || '')}" />
          </div>
          <div class="detail-item">
            <span class="detail-label">Documento</span>
            <strong class="detail-value">${escapeHtml(documentos)}</strong>
          </div>
          <div class="detail-item">
            <span class="detail-label">Telefone</span>
            <input class="editable-input" data-field="telefone" aria-label="Telefone" value="${escapeHtml(producer.telefone || '')}" />
          </div>
          <div class="detail-item">
            <span class="detail-label">E-mail</span>
            <input class="editable-input" data-field="email" aria-label="E-mail" value="${escapeHtml(producer.email || '')}" />
          </div>
          <div class="detail-item detail-item-wide">
            <span class="detail-label">Endereço</span>
            <input class="editable-input" data-field="endereco" aria-label="Endereço" value="${escapeHtml(producer.endereco || '')}" />
          </div>
          <div class="detail-item">
            <span class="detail-label">Conta para depósito</span>
            <input class="editable-input" data-field="conta_para_deposito" aria-label="Conta para depósito" value="${escapeHtml(producer.conta_para_deposito || '')}" />
          </div>
          <div class="detail-item detail-item-wide">
            <span class="detail-label">Observação</span>
            <textarea class="editable-input" data-field="observacao" aria-label="Observação" rows="2">${escapeHtml(producer.observacao || '')}</textarea>
          </div>
          <div class="detail-item">
            <span class="detail-label">Cadastro</span>
            <strong class="detail-value">${escapeHtml(formatDate(producer.created_at))}</strong>
          </div>
        </div>

        <section class="producer-product-section">
          <div class="section-header">
            <div>
              <h3>Dados do produto / nota</h3>
              <p>Estas informações aparecem na ficha e no PDF do produtor.</p>
            </div>
          </div>

          <div class="producer-product-grid">
            ${productFields}
          </div>
        </section>

        <section class="contract-section">
          <div class="section-header">
            <div>
              <h3>Contratos</h3>
              <p>Envie apenas uma foto do contrato para anexar ao produtor.</p>
            </div>
          </div>

          <form class="contract-upload-form" data-contract-form="${escapeHtml(producer.id)}">
            <label>
              <span>Foto do contrato</span>
              <input name="contract_file" type="file" accept="image/*" required />
            </label>

            <div class="actions">
              <button type="submit" class="btn btn-primary btn-small">Anexar foto</button>
              <p class="message" data-contract-message="${escapeHtml(producer.id)}" aria-live="polite"></p>
            </div>
          </form>

          <div class="contract-list" data-contract-list="${escapeHtml(producer.id)}">
            <div class="empty">Abra este produtor para carregar os contratos.</div>
          </div>
        </section>

        <div class="row-actions producer-actions">
          <button class="btn btn-primary save-button" type="button" data-save-id="${escapeHtml(producer.id)}" aria-label="Salvar produtor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 4h11v6h2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6v-2H5V4z" fill="currentColor"/><path d="M19 13v6h-8v2h8a1 1 0 0 0 1-1v-7h-1z" fill="currentColor"/></svg>
            Salvar
          </button>
          <a class="action-link" href="/?edit=${encodeURIComponent(producer.id)}">Editar produtor</a>
          <button class="btn btn-outline btn-small toolbar-button" type="button" data-pdf-id="${escapeHtml(producer.id)}" aria-label="Gerar PDF do produtor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 2h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M13 2v6h6" fill="currentColor"/></svg>
            PDF
          </button>
          <button class="btn btn-destructive btn-small danger-button" type="button" data-delete-id="${escapeHtml(producer.id)}" aria-label="Excluir produtor">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 3v1H4v2h16V4h-5V3H9z" fill="currentColor"/><path d="M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12H7z" fill="currentColor"/></svg>
            Excluir
          </button>
        </div>
      </div>
    </details>
  `;
}

function renderContracts(producerId, contracts) {
  const contractList = producerList.querySelector(`[data-contract-list="${CSS.escape(String(producerId))}"]`);

  if (!contractList) {
    return;
  }

  if (!contracts.length) {
    contractList.innerHTML = '<div class="empty">Nenhum contrato cadastrado para este produtor.</div>';
    return;
  }

  contractList.innerHTML = `
    <div class="contract-items">
          ${contracts.map((contract) => `
        <article class="contract-item">
          <div class="contract-item-head">
            <strong>${escapeHtml(contract.nome_arquivo)}</strong>
            <a class="contract-link" href="${escapeHtml(contract.caminho_arquivo)}" target="_blank" rel="noreferrer" aria-label="Abrir arquivo do contrato ${escapeHtml(contract.nome_arquivo)}">Abrir arquivo</a>
            <button class="btn btn-destructive btn-small contract-delete" type="button" data-contract-id="${escapeHtml(contract.id)}" data-producer-id="${escapeHtml(producerId)}" aria-label="Excluir contrato ${escapeHtml(contract.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 3v1H4v2h16V4h-5V3H9z" fill="currentColor"/><path d="M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12H7z" fill="currentColor"/></svg>
              Excluir
            </button>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

async function loadContractsForProducer(producerId) {
  if (loadedContracts.has(String(producerId))) {
    return;
  }

  const contractList = producerList.querySelector(`[data-contract-list="${CSS.escape(String(producerId))}"]`);

  if (contractList) {
    contractList.innerHTML = '<div class="empty">Carregando contratos...</div>';
  }

  try {
    const response = await fetch(`/api/produtores/${producerId}/contratos`);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    const payload = await readApiPayload(response);

    if (!response.ok) {
      throw new Error(payload.message || 'Falha ao carregar contratos.');
    }

    loadedContracts.add(String(producerId));
    renderContracts(producerId, Array.isArray(payload) ? payload : []);
  } catch (error) {
    if (contractList) {
      contractList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  }
}

async function deleteProducer(id) {
  const confirmDelete = window.confirm('Tem certeza que deseja excluir este produtor?');

  if (!confirmDelete) {
    return;
  }

  const response = await fetch(`/api/produtores/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Falha ao excluir produtor.');
  }

  await loadProducers();
}

async function deleteContract(producerId, contractId) {
  const confirmDelete = window.confirm('Tem certeza que deseja excluir este contrato?');

  if (!confirmDelete) return;

  const response = await fetch(`/api/produtores/${producerId}/contratos/${contractId}`, {
    method: 'DELETE'
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Falha ao excluir contrato.');
  }

  // Force reload contracts for this producer
  loadedContracts.delete(String(producerId));
  await loadContractsForProducer(producerId);
}

async function downloadPdf(producerId) {
  try {
    const response = await fetch(`/api/produtores/${producerId}/pdf`, { credentials: 'same-origin' });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      const payload = await readApiPayload(response);
      throw new Error(payload.message || 'Falha ao gerar PDF.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produtor-${producerId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert(error.message);
  }
}

async function saveProducer(producerId, buttonElement) {
  const details = producerList.querySelector(`[data-producer-id="${CSS.escape(String(producerId))}"]`);
  if (!details) return;

  const inputs = details.querySelectorAll('.editable-input');
  const payload = {};
  inputs.forEach((input) => {
    const field = input.dataset.field;
    if (!field) return;
    payload[field] = input.value;
  });

  if (buttonElement) {
    buttonElement.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    buttonElement.dataset.origText = buttonElement.textContent;
    buttonElement.textContent = '';
    buttonElement.appendChild(spinner);
  }

  try {
    const response = await fetch(`/api/produtores/${producerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await readApiPayload(response);

    if (!response.ok) {
      throw new Error(data.message || 'Falha ao salvar produtor.');
    }

    // update cached producers and UI
    await loadProducers();
    if (buttonElement) {
      buttonElement.textContent = 'Salvo';
      setTimeout(() => {
        buttonElement.textContent = buttonElement.dataset.origText || 'Salvar';
      }, 1500);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    if (buttonElement) buttonElement.disabled = false;
  }
}

function renderProducers(producers) {
  countText.textContent = `${producers.length} produtor${producers.length === 1 ? '' : 'es'} encontrado${producers.length === 1 ? '' : 's'}`;

  if (!producers.length) {
    producerList.innerHTML = '<div class="empty">Nenhum produtor encontrado.</div>';
    return;
  }

  producerList.innerHTML = producers.map(buildProducerCard).join('');

  producerList.querySelectorAll('details.producer-card').forEach((detailsElement) => {
    detailsElement.addEventListener('toggle', async () => {
      if (!detailsElement.open) {
        return;
      }

      const producerId = detailsElement.dataset.producerId;
      await loadContractsForProducer(producerId);
    });
  });

  // add/remove visual "selected" class on open/close for better UX
  producerList.querySelectorAll('details.producer-card').forEach((detailsElement) => {
    detailsElement.addEventListener('toggle', () => {
      if (detailsElement.open) {
        detailsElement.classList.add('selected');
      } else {
        detailsElement.classList.remove('selected');
      }
    });
  });
}

async function loadProducers() {
  try {
    const response = await fetch('/api/produtores');

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    const payload = await readApiPayload(response);

    if (!response.ok) {
      throw new Error(payload.message || 'Falha ao carregar a lista de produtores.');
    }

    cachedProducers = Array.isArray(payload) ? payload : [];
    loadedContracts.clear();
    renderProducers(filterProducers(cachedProducers, searchInput.value));
  } catch (error) {
    countText.textContent = 'Erro';
    const friendlyMessage = error.name === 'TypeError'
      ? 'Servidor local não encontrado. Execute npm start antes de abrir a lista.'
      : error.message;

    producerList.innerHTML = `<div class="empty">${escapeHtml(friendlyMessage)}</div>`;
  }
}

producerList.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-contract-form]');

  if (!form) {
    return;
  }

  event.preventDefault();

  const producerId = form.dataset.contractForm;
  const messageElement = producerList.querySelector(`[data-contract-message="${CSS.escape(String(producerId))}"]`);
  const formData = new FormData(form);

  if (messageElement) {
    messageElement.textContent = 'Lendo contrato...';
    messageElement.className = 'message';
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      const s = document.createElement('span');
      s.className = 'spinner';
      s.setAttribute('aria-hidden', 'true');
      submitButton.dataset.origText = submitButton.textContent;
      submitButton.textContent = '';
      submitButton.appendChild(s);
    }
  }

  try {
    const response = await fetch(`/api/produtores/${producerId}/contratos`, {
      method: 'POST',
      body: formData
    });

    const data = await readApiPayload(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(data.message || 'Falha ao salvar contrato.');
    }

    form.reset();
    loadedContracts.delete(String(producerId));
    await loadContractsForProducer(producerId);

    if (messageElement) {
      messageElement.textContent = 'Foto anexada com sucesso.';
      messageElement.className = 'message success';
    }
  } catch (error) {
    if (messageElement) {
      messageElement.textContent = error.message;
      messageElement.className = 'message error';
    }
  }
  finally {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = false;
      if (submitButton.dataset.origText) {
        submitButton.textContent = submitButton.dataset.origText;
        delete submitButton.dataset.origText;
      }
    }
  }
});

producerList.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete-id]');
  const deleteContractButton = event.target.closest('[data-contract-id]');
  const pdfButton = event.target.closest('[data-pdf-id]');
  const saveButton = event.target.closest('[data-save-id]');

  if (pdfButton) {
    const btn = pdfButton;
    try {
      btn.disabled = true;
      const span = document.createElement('span');
      span.className = 'spinner';
      span.setAttribute('aria-hidden', 'true');
      btn.dataset.origText = btn.textContent;
      btn.textContent = '';
      btn.appendChild(span);
      await downloadPdf(btn.dataset.pdfId);
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      if (btn.dataset.origText) {
        btn.textContent = btn.dataset.origText;
        delete btn.dataset.origText;
      }
    }
    return;
  }

  if (saveButton) {
    try {
      await saveProducer(saveButton.dataset.saveId, saveButton);
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  if (!deleteButton) {
    // if it's not a producer delete button, check for contract delete
    if (!deleteContractButton) return;
    try {
      await deleteContract(deleteContractButton.dataset.producerId, deleteContractButton.dataset.contractId);
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  try {
    await deleteProducer(deleteButton.dataset.deleteId);
  } catch (error) {
    alert(error.message);
  }
});

loadProducers();

// Theme toggle removed — app uses default light theme.

searchInput.addEventListener('input', () => {
  renderProducers(filterProducers(cachedProducers, searchInput.value));
});

refreshButton.addEventListener('click', () => {
  searchInput.value = '';
  loadProducers();
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
});