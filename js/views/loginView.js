import { $, $$, esc } from '../utils/dom.js';
import { navigate, consumePendingPath } from '../router.js';
import { login, verifyTotp } from '../api/users.js';
import { startSession } from '../session.js';

let step = 'credentials'; // 'credentials' | 'totp'
let pendingChallengeId = null;
let pendingUsername = '';

function credentialsTemplate(error) {
  return `
    <form class="auth-card" id="login-form" novalidate>
      <div class="auth-logo">
        <span class="material-icons">cloud</span>
        <span>Drive Upb</span>
      </div>
      <h1 class="auth-title">Iniciar sesión</h1>
      <p class="auth-subtitle">Accede al Drive corporativo de UPB-Científica</p>

      ${error ? `<p class="auth-error" role="alert">${esc(error)}</p>` : ''}

      <label class="auth-field">
        <span>Usuario</span>
        <input type="text" id="login-username" name="username" autocomplete="username" required>
      </label>
      <label class="auth-field">
        <span>Contraseña</span>
        <input type="password" id="login-password" name="password" autocomplete="current-password" required>
      </label>

      <button class="btn-primary auth-submit" type="submit" id="login-submit">Continuar</button>

      <a class="auth-link" href="/configurar-mfa">¿No tienes configurada la autenticación en dos pasos?</a>
    </form>
  `;
}

function totpTemplate(username, error) {
  return `
    <div class="auth-card">
      <div class="auth-logo">
        <span class="material-icons">shield</span>
        <span>Drive Upb</span>
      </div>
      <h1 class="auth-title">Verificación en dos pasos</h1>
      <p class="auth-subtitle">Ingresa el código de 6 dígitos de tu app de autenticación para <strong>${esc(username)}</strong></p>

      ${error ? `<p class="auth-error" role="alert">${esc(error)}</p>` : ''}

      <div class="totp-boxes" id="totp-boxes" role="group" aria-label="Código de verificación de 6 dígitos">
        ${Array.from({ length: 6 }, (_, i) => `
          <input class="totp-box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1"
                 aria-label="Dígito ${i + 1} de 6" data-idx="${i}">
        `).join('')}
      </div>

      <button class="btn-primary auth-submit" type="button" id="totp-submit">Verificar</button>
      <button class="btn-text auth-submit" type="button" id="totp-back">Volver</button>
    </div>
  `;
}

function bindTotpBoxes(root, onComplete) {
  const boxes = $$('.totp-box', root);
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && boxes[i + 1]) boxes[i + 1].focus();
      if (boxes.every((b) => b.value)) onComplete(boxes.map((b) => b.value).join(''));
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && boxes[i - 1]) boxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!text) return;
      e.preventDefault();
      text.split('').forEach((digit, idx) => { if (boxes[idx]) boxes[idx].value = digit; });
      const next = boxes[text.length] || boxes[boxes.length - 1];
      next.focus();
      if (text.length === 6) onComplete(text);
    });
  });
  if (boxes[0]) boxes[0].focus();
}

function renderCredentials(root, error) {
  root.innerHTML = `<div class="auth-screen">${credentialsTemplate(error)}</div>`;
  const form = $('#login-form', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#login-username', root).value.trim();
    const password = $('#login-password', root).value;
    const submitBtn = $('#login-submit', root);
    if (!username || !password) {
      renderCredentials(root, 'Usuario y contraseña son obligatorios');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando…';
    try {
      const result = await login({ username, password });
      pendingUsername = username;
      // El sistema autentica con token: si el login ya devolvió la sesión, se
      // entra directo. El paso de verificación sigue disponible para cuando el
      // directorio active el segundo factor.
      if (result.token) {
        startSession(result);
        step = 'credentials';
        navigate(consumePendingPath() || '/archivos');
        return;
      }
      pendingChallengeId = result.challengeId;
      step = 'totp';
      renderTotp(root, null);
    } catch (err) {
      renderCredentials(root, err.message || 'No se pudo iniciar sesión');
    }
  });
}

function renderTotp(root, error) {
  root.innerHTML = `<div class="auth-screen">${totpTemplate(pendingUsername, error)}</div>`;
  const submitBtn = $('#totp-submit', root);
  const backBtn = $('#totp-back', root);

  const submit = async (code) => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando…';
    try {
      const { token, expiresInSeconds, user } = await verifyTotp({ challengeId: pendingChallengeId, code });
      startSession({ token, expiresInSeconds, user });
      step = 'credentials';
      navigate(consumePendingPath() || '/archivos');
    } catch (err) {
      renderTotp(root, err.message || 'Código inválido');
    }
  };

  bindTotpBoxes(root, submit);
  submitBtn.addEventListener('click', () => {
    const code = $$('.totp-box', root).map((b) => b.value).join('');
    if (code.length < 6) { renderTotp(root, 'Ingresa los 6 dígitos'); return; }
    submit(code);
  });
  backBtn.addEventListener('click', () => {
    step = 'credentials';
    renderCredentials(root, null);
  });
}

export function mount(root) {
  step = 'credentials';
  pendingChallengeId = null;
  pendingUsername = '';
  renderCredentials(root, null);
  return null;
}
