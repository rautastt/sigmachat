// ===================== AUTH =====================
'use strict';

function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  const tabEl = document.querySelector(`[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');
  const formEl = document.getElementById(`${tab}-form`);
  if (formEl) formEl.classList.add('active');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => showAuthTab(tab.dataset.tab));
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  try {
    const { user } = await post('/auth/login', { username, password });
    State.currentUser = user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// Register
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  try {
    const { user } = await post('/auth/register', { username, email, password });
    State.currentUser = user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// Forgot password
document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('forgot-error');
  const succEl = document.getElementById('forgot-success');
  errEl.textContent = ''; succEl.textContent = '';
  try {
    await post('/auth/forgot-password', { email: document.getElementById('forgot-email').value });
    succEl.textContent = 'If that email exists, a reset link was sent.';
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// Reset password
document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('reset-error');
  const succEl = document.getElementById('reset-success');
  errEl.textContent = ''; succEl.textContent = '';
  try {
    await post('/auth/reset-password', {
      token: document.getElementById('reset-token').value,
      password: document.getElementById('reset-password').value,
    });
    succEl.textContent = 'Password reset! Please log in.';
    setTimeout(() => showAuthTab('login'), 2000);
  } catch (err) {
    errEl.textContent = err.message;
  }
});
