let toastTimer = null;

export function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = 'toast ' + type;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}
