let toastTimer = null;

export function showToast(message, type = '', { persistent = false } = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = 'toast ' + type;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (persistent) return;
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}
