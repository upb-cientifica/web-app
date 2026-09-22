import { $, esc } from '../utils/dom.js';
import { enrollMfa } from '../api/users.js';
import { qrcode } from '../vendor/qrcode.js';

function loadingTemplate() {
  return `
    <div class="auth-screen">
      <div class="auth-card">
        <p class="auth-subtitle">Generando código QR…</p>
      </div>
    </div>
  `;
}

function errorTemplate(message) {
  return `
    <div class="auth-screen">
      <div class="auth-card">
        <p class="auth-error" role="alert">${esc(message)}</p>
        <a class="btn-text auth-submit" href="/login">Volver a iniciar sesión</a>
      </div>
    </div>
  `;
}

function svgFor(otpauthUrl) {
  const qr = qrcode(0, 'M');
  qr.addData(otpauthUrl);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 8 });
}

function contentTemplate({ secret, otpauthUrl, backupCodes }) {
  return `
    <div class="auth-screen">
      <div class="auth-card auth-card-wide">
        <div class="auth-logo">
          <span class="material-icons">shield</span>
          <span>Drive Upb</span>
        </div>
        <h1 class="auth-title">Configurar autenticación en dos pasos</h1>
        <p class="auth-subtitle">Escanea este código con tu app de autenticación (Google Authenticator, Aegis, FreeOTP, etc.)</p>

        <div class="qr-wrap">${svgFor(otpauthUrl)}</div>

        <p class="auth-subtitle">¿No puedes escanear? Ingresa este código manualmente:</p>
        <code class="mfa-secret">${esc(secret)}</code>

        <p class="auth-subtitle">Guarda estos códigos de respaldo en un lugar seguro. Cada uno se puede usar una sola vez si pierdes acceso a tu app:</p>
        <ul class="backup-codes">
          ${backupCodes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}
        </ul>

        <a class="btn-primary auth-submit" href="/login">Ya configuré mi app, iniciar sesión</a>
      </div>
    </div>
  `;
}

export async function mount(root) {
  root.innerHTML = loadingTemplate();
  try {
    const data = await enrollMfa();
    root.innerHTML = contentTemplate(data);
  } catch (err) {
    root.innerHTML = errorTemplate(err.message || 'No se pudo generar el enrolamiento MFA');
  }
  return null;
}
