// Controlador de la zona de arrastrar-y-soltar del modal de subida.
// Reutilizable por otras vistas que suban archivos (p. ej. álbum de fotos).

export function initDropzone(dropzoneEl, { onFilesSelected } = {}) {
  if (!dropzoneEl) return () => {};

  const onDragEnter = (e) => { e.preventDefault(); dropzoneEl.classList.add('dragover'); };
  const onDragLeave = (e) => { e.preventDefault(); dropzoneEl.classList.remove('dragover'); };
  const onDrop = (e) => {
    e.preventDefault();
    dropzoneEl.classList.remove('dragover');
    const fileList = e.dataTransfer.files;
    if (fileList && fileList.length && onFilesSelected) onFilesSelected(Array.from(fileList));
  };

  dropzoneEl.addEventListener('dragenter', onDragEnter);
  dropzoneEl.addEventListener('dragover', onDragEnter);
  dropzoneEl.addEventListener('dragleave', onDragLeave);
  dropzoneEl.addEventListener('drop', onDrop);

  const fileInput = dropzoneEl.querySelector('input[type="file"]');
  const onInputChange = () => {
    if (fileInput.files && fileInput.files.length && onFilesSelected) {
      onFilesSelected(Array.from(fileInput.files));
    }
  };
  if (fileInput) fileInput.addEventListener('change', onInputChange);

  return () => {
    dropzoneEl.removeEventListener('dragenter', onDragEnter);
    dropzoneEl.removeEventListener('dragover', onDragEnter);
    dropzoneEl.removeEventListener('dragleave', onDragLeave);
    dropzoneEl.removeEventListener('drop', onDrop);
    if (fileInput) fileInput.removeEventListener('change', onInputChange);
  };
}
