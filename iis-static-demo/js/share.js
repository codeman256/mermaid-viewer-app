import { state } from './state.js';
import { shareBtn, mermaidLiveBtn } from './dom.js';

// Only needed if the app runs behind a reverse proxy under a different
// public hostname than Node sees — lets Share always emit that canonical
// hostname. If unset, the actual visited URL (window.location.href) is used
// as-is, which is already correct for the common case.
let publicBaseUrl = '';

function currentShareUrl() {
  if (!publicBaseUrl) return window.location.href;
  return publicBaseUrl + window.location.pathname + window.location.search;
}

// Encodes the current diagram source as a mermaid.live editor URL. Built
// lazily on click (rather than kept around per-file) since the encoded
// state can be tens of KB for a large diagram — no reason to carry that
// around for every file in the list when only one link is ever used.
function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMermaidLiveUrl(code) {
  const liveEditorState = {
    code,
    mermaid: JSON.stringify({ theme: 'default' }),
    autoSync: true,
    updateDiagram: true,
    panZoom: true,
    rough: false,
    editorMode: 'code',
  };
  return 'https://mermaid.live/edit#base64:' + toBase64Url(JSON.stringify(liveEditorState));
}

export function wireShareControls() {
  fetch('api/config')
    .then((r) => r.json())
    .then((cfg) => { publicBaseUrl = cfg.publicBaseUrl || ''; })
    .catch(() => {});

  let shareResetTimer = null;
  shareBtn.addEventListener('click', async () => {
    if (!state.currentFile) return;
    try {
      await navigator.clipboard.writeText(currentShareUrl());
      shareBtn.textContent = 'Copied!';
    } catch {
      shareBtn.textContent = 'Copy failed';
    }
    clearTimeout(shareResetTimer);
    shareResetTimer = setTimeout(() => { shareBtn.textContent = 'Share'; }, 1500);
  });

  mermaidLiveBtn.addEventListener('click', () => {
    if (!state.currentCode) return;
    window.open(buildMermaidLiveUrl(state.currentCode), '_blank', 'noopener');
  });
}
