import { state } from './state.js';
import {
  diagramContainer, zoomLabel, zoomOutBtn, zoomInBtn, fitScreenBtn, goToStartBtn, zoomResetBtn,
} from './dom.js';
import { getSvgDimensions } from './svg-utils.js';

const ZOOM_STEP_FACTOR = 1.1; // multiplicative ~10% per step
const TAP_MOVEMENT_THRESHOLD = 4; // px

// pointerId -> last known {x, y} in client coordinates, for every pointer
// currently pressed down on the viewport (one entry per finger while
// touching, or the one mouse pointer while dragging).
const activePointers = new Map();

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let pointerDownTarget = null;
let pointerDownX = 0;
let pointerDownY = 0;

// True once a gesture has ever had 2+ simultaneous pointers — guards
// tryHandleLinkTap so lifting one finger after a pinch (small movement on
// that finger alone) doesn't get misread as a tap on whatever was underneath.
let gestureHadMultiplePointers = false;
let isPinching = false;
let pinchPrevDistance = 0;

function pointerDistance() {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerMidpoint() {
  const [a, b] = [...activePointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

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
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);

    if (activePointers.size === 2) {
      // A second finger just landed — switch from single-finger pan to
      // two-finger pinch-zoom for the rest of this gesture.
      isDragging = false;
      isPinching = true;
      gestureHadMultiplePointers = true;
      pinchPrevDistance = pointerDistance();
    } else if (activePointers.size === 1) {
      isDragging = true;
      isPinching = false;
      gestureHadMultiplePointers = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      pointerDownTarget = event.target;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      viewport.classList.add('grabbing');
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (isPinching && activePointers.size === 2) {
      const distance = pointerDistance();
      const midpoint = pointerMidpoint();
      const rect = diagramContainer.getBoundingClientRect();
      if (pinchPrevDistance > 0) {
        zoomAtPoint(state.zoom * (distance / pinchPrevDistance), midpoint.x - rect.left, midpoint.y - rect.top);
      }
      pinchPrevDistance = distance;
      return;
    }

    if (!isDragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    state.panX += dx;
    state.panY += dy;
    updateTransform();
  });

  function endPointer(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (isPinching) {
      if (activePointers.size < 2) isPinching = false;
      if (activePointers.size === 1) {
        // One finger remains down — resume single-finger panning from
        // wherever it currently is, instead of jumping back to dragStartX/Y
        // from before the pinch began.
        const [remaining] = [...activePointers.values()];
        isDragging = true;
        dragStartX = remaining.x;
        dragStartY = remaining.y;
      }
      if (activePointers.size === 0) viewport.classList.remove('grabbing');
      return;
    }

    if (isDragging) {
      isDragging = false;
      viewport.classList.remove('grabbing');
      const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      if (moved < TAP_MOVEMENT_THRESHOLD && !gestureHadMultiplePointers) {
        tryHandleLinkTap(pointerDownTarget, event);
      }
      pointerDownTarget = null;
    }
  }

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse' || !isDragging) return;
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
