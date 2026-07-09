import { state } from './state.js';
import {
  diagramContainer, zoomLabel, zoomOutBtn, zoomInBtn, fitScreenBtn, goToStartBtn, zoomResetBtn,
} from './dom.js';
import { getSvgDimensions } from './svg-utils.js';

const ZOOM_STEP_FACTOR = 1.1; // multiplicative ~10% per step
const TAP_MOVEMENT_THRESHOLD = 4; // px

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let pointerDownTarget = null;
let pointerDownX = 0;
let pointerDownY = 0;

// Set by main.js to whatever should happen when the reader taps an
// in-diagram link (see tryHandleLinkTap below) — an injected callback rather
// than importing file-list.js directly, since file-list.js imports render.js
// which imports this module (would otherwise be circular).
let linkTapHandler = null;
export function setLinkTapHandler(fn) {
  linkTapHandler = fn;
}

export function updateTransform() {
  if (!state.viewport) return;
  state.viewport.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

// Zooms while keeping the content under (pivotX, pivotY) — in
// #diagram-container's own coordinate space — visually fixed on screen.
export function zoomAtPoint(newZoomRaw, pivotX, pivotY) {
  const oldZoom = state.zoom;
  const nextZoom = Math.max(0.05, Math.min(10, newZoomRaw));
  if (nextZoom === oldZoom) return;
  state.zoom = nextZoom;
  const ratio = state.zoom / oldZoom;
  state.panX = pivotX - ratio * (pivotX - state.panX);
  state.panY = pivotY - ratio * (pivotY - state.panY);
  updateTransform();
}

export function centerDiagram() {
  if (!state.viewport) return;
  const svg = state.viewport.querySelector('svg');
  if (!svg) return;
  const dims = getSvgDimensions(svg);
  const containerRect = diagramContainer.getBoundingClientRect();
  state.panX = (containerRect.width - dims.width * state.zoom) / 2;
  state.panY = (containerRect.height - dims.height * state.zoom) / 2;
  updateTransform();
}

export function resetView() {
  state.zoom = 1;
  centerDiagram();
}

export function fitToScreen() {
  if (!state.viewport) return;
  const svg = state.viewport.querySelector('svg');
  if (!svg) return;

  const dims = getSvgDimensions(svg);
  if (!dims.width || !dims.height) return;

  const containerRect = diagramContainer.getBoundingClientRect();
  const availableWidth = containerRect.width;
  const availableHeight = containerRect.height;
  const scale = Math.min(availableWidth / dims.width, availableHeight / dims.height, 10);

  state.zoom = Math.max(0.05, Math.min(scale, 10));
  state.panX = (availableWidth - dims.width * state.zoom) / 2;
  state.panY = (availableHeight - dims.height * state.zoom) / 2;
  updateTransform();
}

// Fits the diagram for readability rather than literally "fit its width":
// tall/skinny diagrams (TD-style flowcharts) fit to the container's width
// and anchor to the top, so the reader starts at the top and pans down.
// Wide/short diagrams (LR-style flowcharts) fit to the container's height
// and anchor to the left, so the reader starts at the left and pans right.
export function goToStart() {
  if (!state.viewport) return;
  const svg = state.viewport.querySelector('svg');
  if (!svg) return;

  const dims = getSvgDimensions(svg);
  if (!dims.width || !dims.height) return;

  const containerRect = diagramContainer.getBoundingClientRect();
  const availableWidth = containerRect.width;
  const availableHeight = containerRect.height;
  const isTall = dims.height >= dims.width;
  const scale = isTall ? availableWidth / dims.width : availableHeight / dims.height;

  state.zoom = Math.max(0.05, Math.min(scale, 10));
  if (isTall) {
    state.panX = (availableWidth - dims.width * state.zoom) / 2;
    state.panY = 0;
  } else {
    state.panX = 0;
    state.panY = (availableHeight - dims.height * state.zoom) / 2;
  }
  updateTransform();
}

// Diagrams can link to other diagrams via `click nodeId href "?file=other.mmd"`
// (rendered by mermaid as an SVG <a>, with the link set via the legacy
// xlink:href attribute rather than plain href). We can't rely on the
// browser's native "click" event to detect this: viewport.setPointerCapture()
// below (needed for drag-to-pan) redirects/suppresses the click event that
// would normally follow a pointerdown/pointerup pair on many engines, so a
// tap on a node link silently does nothing. Instead we detect "was this a
// tap, not a drag" ourselves in the pointerdown/pointerup pair we already
// control, using the pointerdown's original target (captured before any
// retargeting) rather than trusting the click event at all.
function tryHandleLinkTap(targetEl, event) {
  if (!targetEl || !targetEl.closest || !linkTapHandler) return;
  const anchor = targetEl.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') || anchor.getAttribute('xlink:href');
  if (!href) return;
  let url;
  try { url = new URL(href, window.location.href); } catch { return; }
  if (url.origin !== window.location.origin) return; // external link, let it behave normally
  const target = url.searchParams.get('file');
  if (!target) return; // not a recognized in-app link
  if (event && event.preventDefault) event.preventDefault();
  linkTapHandler(target);
}

export function createPanZoom() {
  state.viewport = document.getElementById('diagram-viewport');
  if (!state.viewport) return;
  const viewport = state.viewport;

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = diagramContainer.getBoundingClientRect(); // container, not viewport
    const pivotX = event.clientX - rect.left;
    const pivotY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
    zoomAtPoint(state.zoom * factor, pivotX, pivotY);
  }, { passive: false });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    pointerDownTarget = event.target;
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    viewport.classList.add('grabbing');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    state.panX += dx;
    state.panY += dy;
    updateTransform();
  });

  viewport.addEventListener('pointerup', (event) => {
    isDragging = false;
    viewport.classList.remove('grabbing');
    viewport.releasePointerCapture(event.pointerId);
    const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
    if (moved < TAP_MOVEMENT_THRESHOLD) {
      tryHandleLinkTap(pointerDownTarget, event);
    }
    pointerDownTarget = null;
  });

  viewport.addEventListener('pointerleave', () => {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('grabbing');
  });
}

export function wireZoomControls() {
  zoomOutBtn.addEventListener('click', () => {
    const rect = diagramContainer.getBoundingClientRect();
    zoomAtPoint(state.zoom / ZOOM_STEP_FACTOR, rect.width / 2, rect.height / 2);
  });

  zoomInBtn.addEventListener('click', () => {
    const rect = diagramContainer.getBoundingClientRect();
    zoomAtPoint(state.zoom * ZOOM_STEP_FACTOR, rect.width / 2, rect.height / 2);
  });

  fitScreenBtn.addEventListener('click', fitToScreen);
  goToStartBtn.addEventListener('click', goToStart);
  zoomResetBtn.addEventListener('click', resetView);

  window.addEventListener('resize', () => {
    fitToScreen();
  });
}
