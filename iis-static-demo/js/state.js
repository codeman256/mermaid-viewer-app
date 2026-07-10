// Shared mutable state for the current view — kept in one place so modules
// that need to read or update it (panzoom, render, file-list, share, theme)
// don't have to pass it through long call chains.
export const state = {
  currentFile: null,
  currentCode: null,
  // Set by source.fetchFileList(): true under server.js (Option A), false
  // when served as plain static files with no backend (Option B).
  apiAvailable: true,
  zoom: 1,
  panX: 0,
  panY: 0,
  viewport: null,
  renderCount: 0,
};
