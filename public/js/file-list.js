import { state } from './state.js';
import {
  fileListEl, diagramContainer, diagramTitle, shareBtn, mermaidLiveBtn, fileSearchInput, fileSearchClearBtn,
} from './dom.js';
import { fetchFileList, fetchDiagramSource } from './source.js';
import { renderDiagram } from './render.js';

let fileFilterQuery = '';

export function findFileListItem(name) {
  return [...fileListEl.children].find((li) => li.dataset.file === name) || null;
}

export async function loadFileList() {
  try {
    const files = await fetchFileList();
    fileListEl.innerHTML = '';
    if (files.length === 0) {
      fileListEl.innerHTML = '<li class="status">No .mmd files found</li>';
      return;
    }
    files.forEach((name) => {
      const displayName = name.replace(/\.mmd$/i, '').split('/').join(' / ');
      const li = document.createElement('li');
      li.textContent = displayName;
      li.dataset.file = name;
      if (name === state.currentFile) li.classList.add('active');
      li.addEventListener('click', () => selectFile(name));
      fileListEl.appendChild(li);
    });
    applyFileFilter();
  } catch {
    fileListEl.innerHTML = '<li class="status">Could not reach server</li>';
  }
}

function applyFileFilter() {
  [...fileListEl.children].forEach((li) => {
    if (!li.dataset.file) return; // skip "Loading…"/"No files"/status placeholders
    const match = !fileFilterQuery || li.textContent.toLowerCase().includes(fileFilterQuery);
    li.classList.toggle('hidden', !match);
  });
}

function updateSearchClearVisibility() {
  fileSearchClearBtn.hidden = fileSearchInput.value.length === 0;
}

export function wireFileSearch() {
  fileSearchInput.addEventListener('input', () => {
    fileFilterQuery = fileSearchInput.value.trim().toLowerCase();
    applyFileFilter();
    updateSearchClearVisibility();
  });

  fileSearchClearBtn.addEventListener('click', () => {
    fileSearchInput.value = '';
    fileFilterQuery = '';
    applyFileFilter();
    updateSearchClearVisibility();
    fileSearchInput.focus();
  });
}

export async function selectFile(name) {
  state.currentFile = name;
  fileListEl.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
  const li = findFileListItem(name);
  if (li) li.classList.add('active');
  const displayTitle = name.replace(/\.mmd$/i, '').split('/').join(' / ');
  diagramTitle.textContent = displayTitle;
  diagramContainer.innerHTML = '<div class="status">Loading…</div>';

  try {
    const code = await fetchDiagramSource(name);
    state.currentCode = code;
    await renderDiagram(code);
    history.pushState(null, '', '?file=' + encodeURI(name));
    shareBtn.disabled = false;
    mermaidLiveBtn.disabled = false;
  } catch (err) {
    state.currentCode = null;
    diagramContainer.innerHTML = '<pre class="error-box">Error rendering diagram:\n' + err.message + '</pre>';
  }
}

export async function handleFilesPossiblyChanged() {
  await loadFileList();
  if (state.currentFile) {
    // re-render current diagram in case it was the one that changed
    selectFile(state.currentFile);
  }
}
