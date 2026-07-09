import { state } from './state.js';
import { wireThemeToggle } from './theme.js';
import { wireZoomControls, setLinkTapHandler } from './panzoom.js';
import {
  loadFileList, selectFile, findFileListItem, wireFileSearch, handleFilesPossiblyChanged,
} from './file-list.js';
import { wireShareControls } from './share.js';
import { connectLiveUpdates } from './live-updates.js';

setLinkTapHandler(selectFile);
wireThemeToggle();
wireZoomControls();
wireFileSearch();
wireShareControls();

window.addEventListener('popstate', () => {
  const target = new URLSearchParams(location.search).get('file');
  if (!target || target === state.currentFile) return; // ignore no-op / our own pushState
  if (findFileListItem(target)) selectFile(target);
});

(async () => {
  await loadFileList();
  const initialTarget = new URLSearchParams(location.search).get('file');
  if (initialTarget && findFileListItem(initialTarget)) {
    selectFile(initialTarget);
  }
  // Only run after loadFileList() has determined apiAvailable, so live
  // refresh picks the right mode (SSE vs. manifest polling) from the start.
  connectLiveUpdates(handleFilesPossiblyChanged);
})();
