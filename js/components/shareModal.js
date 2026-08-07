import { $, $$, esc } from '../utils/dom.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { listShares, addShare, removeShare, listExternalLinks, createExternalLink, revokeExternalLink } from '../api/files.js';
import { listPrincipals } from '../api/users.js';

const ROLE_LABELS = { viewer: 'Lector', editor: 'Editor' };

let currentItem = null;

function principalIcon(type) {
  return type === 'group' ? 'group' : 'person';
}

async function renderPeoplePanel(panel) {
  panel.innerHTML = '<p class="share-loading">Cargando…</p>';
  try {
    const [sharesList, principals] = await Promise.all([
      listShares({ id: currentItem.id }),
      listPrincipals(),
    ]);
    const sharedIds = new Set(sharesList.map((s) => s.principalId));
    const available = principals.filter((p) => !sharedIds.has(p.id));

    panel.innerHTML = `
      <div class="share-add-row">
        <select class="share-select" id="share-principal-select" ${available.length ? '' : 'disabled'}>
          ${available.length
            ? available.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.email ? ' · ' + esc(p.email) : ''}</option>`).join('')
            : '<option>No hay más personas o grupos para agregar</option>'}
        </select>
        <select class="share-select share-select-role" id="share-role-select">
          <option value="viewer">Lector</option>
          <option value="editor">Editor</option>
        </select>
        <button class="btn-primary" id="share-add-btn" ${available.length ? '' : 'disabled'}>Compartir</button>
      </div>
      <ul class="share-people-list">
        ${sharesList.length ? sharesList.map((s) => `
          <li class="share-person" data-share-id="${esc(s.id)}">
            <span class="material-icons">${principalIcon(s.principal?.type)}</span>
            <div class="share-person-info">
              <span class="share-person-name">${esc(s.principal?.name || 'Desconocido')}</span>
              ${s.principal?.email ? `<span class="share-person-email">${esc(s.principal.email)}</span>` : ''}
            </div>
            <span class="share-role-badge">${esc(ROLE_LABELS[s.role] || s.role)}</span>
            <button class="icon-btn share-remove-btn" data-share-id="${esc(s.id)}" title="Quitar acceso" aria-label="Quitar acceso">
              <span class="material-icons">close</span>
            </button>
          </li>
        `).join('') : '<li class="share-empty">Nadie más tiene acceso todavía.</li>'}
      </ul>
    `;

    const addBtn = $('#share-add-btn', panel);
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const principalId = $('#share-principal-select', panel).value;
        const role = $('#share-role-select', panel).value;
        if (!principalId) return;
        addBtn.disabled = true;
        try {
          await addShare({ id: currentItem.id, principalId, role });
          showToast('Acceso concedido', 'success');
          renderPeoplePanel(panel);
        } catch (err) {
          showToast(err.message || 'No se pudo compartir', 'error');
          addBtn.disabled = false;
        }
      });
    }

    $$('.share-remove-btn', panel).forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await removeShare({ id: currentItem.id, shareId: btn.dataset.shareId });
          showToast('Acceso revocado', 'success');
          renderPeoplePanel(panel);
        } catch (err) {
          showToast(err.message || 'No se pudo revocar el acceso', 'error');
        }
      });
    });
  } catch (err) {
    panel.innerHTML = `<p class="share-error">No se pudo cargar la lista de personas.</p>`;
  }
}

async function renderLinkPanel(panel) {
  panel.innerHTML = '<p class="share-loading">Cargando…</p>';
  try {
    const links = await listExternalLinks({ id: currentItem.id });
    panel.innerHTML = `
      <div class="share-link-form">
        <label class="share-field">
          <span>Permiso</span>
          <select class="share-select" id="link-role-select">
            <option value="viewer">Solo lectura</option>
            <option value="editor">Puede editar</option>
          </select>
        </label>
        <label class="share-field">
          <span>Caduca el</span>
          <input type="date" class="share-select" id="link-expiry-input">
        </label>
        <button class="btn-primary" id="link-create-btn">Crear enlace</button>
      </div>
      <ul class="share-link-list">
        ${links.length ? links.map((l) => `
          <li class="share-link-item" data-link-id="${esc(l.id)}">
            <span class="material-icons">link</span>
            <div class="share-person-info">
              <span class="share-link-url">${esc(location.origin + '/s/' + l.token)}</span>
              <span class="share-person-email">${esc(ROLE_LABELS[l.role] || l.role)} · ${l.expiresAt ? 'caduca ' + esc(l.expiresAt) : 'sin caducidad'}</span>
            </div>
            <button class="icon-btn share-revoke-btn" data-link-id="${esc(l.id)}" title="Revocar enlace" aria-label="Revocar enlace">
              <span class="material-icons">delete</span>
            </button>
          </li>
        `).join('') : '<li class="share-empty">No hay enlaces activos.</li>'}
      </ul>
    `;

    $('#link-create-btn', panel).addEventListener('click', async () => {
      const role = $('#link-role-select', panel).value;
      const expiresAt = $('#link-expiry-input', panel).value || null;
      try {
        await createExternalLink({ id: currentItem.id, role, expiresAt });
        showToast('Enlace creado', 'success');
        renderLinkPanel(panel);
      } catch (err) {
        showToast(err.message || 'No se pudo crear el enlace', 'error');
      }
    });

    $$('.share-revoke-btn', panel).forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await revokeExternalLink({ id: currentItem.id, linkId: btn.dataset.linkId });
          showToast('Enlace revocado', 'success');
          renderLinkPanel(panel);
        } catch (err) {
          showToast(err.message || 'No se pudo revocar el enlace', 'error');
        }
      });
    });
  } catch (err) {
    panel.innerHTML = `<p class="share-error">No se pudo cargar los enlaces.</p>`;
  }
}

function bindTabs() {
  const tabs = $$('.share-tab');
  const panels = {
    people: $('#share-panel-people'),
    link: $('#share-panel-link'),
  };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      Object.entries(panels).forEach(([key, panel]) => {
        panel.classList.toggle('hidden', key !== tab.dataset.tab);
      });
    });
  });
}

let tabsBound = false;

export function openShareModal(item) {
  if (!item) return;
  currentItem = item;
  const title = $('#share-title');
  if (title) title.textContent = `Compartir "${item.name}"`;

  if (!tabsBound) { bindTabs(); tabsBound = true; }

  $$('.share-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  const peoplePanel = $('#share-panel-people');
  const linkPanel = $('#share-panel-link');
  if (peoplePanel) peoplePanel.classList.remove('hidden');
  if (linkPanel) linkPanel.classList.add('hidden');

  openModal('modal-share');
  if (peoplePanel) renderPeoplePanel(peoplePanel);
  if (linkPanel) renderLinkPanel(linkPanel);
}
