const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

function setMessage(text, type = '') {
  loginMessage.textContent = text;
  loginMessage.className = `message ${type}`.trim();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Validando...');

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Não foi possível entrar.');
    }

    window.location.href = data.redirect || '/lista';
  } catch (error) {
    setMessage(error.message, 'error');
  }
});