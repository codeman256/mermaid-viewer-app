import { state } from './state.js';
import { wireThemeToggle } from './theme.js';
import { wireZoomControls, setLinkTapHandler } from './panzoom.js';
import {
  loadFileList, selectFile, findFileListItem, wireFileSearch, handleFilesPossiblyChanged,
} from './file-list.js';
import { wireShareControls } from './share.js';
import { connectLiveUpdates } from './live-updates.js';
import { wireSidebarToggle } from './sidebar.js';
import { loadCustomBrand } from './brand.js';

window.addEventListener('popstate', () => {
  const target = new URLSearchParams(location.search).get('file');
  if (!target || target === state.currentFile) return; // ignore no-op / our own pushState
  if (findFileListItem(target)) selectFile(target);
});

(async () => {
  // Must resolve before wireThemeToggle() below — that call synchronously
  // triggers the first initializeMermaidTheme(), which needs any custom
  // brand's mermaid diagram colours already loaded to take effect.
  await loadCustomBrand();

  setLinkTapHandler(selectFile);
  wireThemeToggle();
  wireZoomControls();
  wireFileSearch();
  wireShareControls();
  wireSidebarToggle();

  await loadFileList();
  const initialTarget = new URLSearchParams(location.search).get('file');
  if (initialTarget && findFileListItem(initialTarget)) {
    selectFile(initialTarget);
  }
  // Only run after loadFileList() has determined apiAvailable, so live
  // refresh picks the right mode (SSE vs. manifest polling) from the start.
  connectLiveUpdates(handleFilesPossiblyChanged);
})();
