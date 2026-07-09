import { state } from './state.js';
import { diagramContainer } from './dom.js';
import { normalizeSvgSize, getSvgDimensions } from './svg-utils.js';
import { fixDarkModeNodeContrast } from './dark-contrast.js';
import { createPanZoom, fitToScreen, updateTransform } from './panzoom.js';

export async function renderDiagram(code, { preserveView = false } = {}) {
  const id = 'mermaid-diagram-' + (state.renderCount++);
  const { svg } = await mermaid.render(id, code);
  diagramContainer.innerHTML = '<div id="diagram-viewport">' + svg + '</div>';
  const svgEl = diagramContainer.querySelector('svg');
  if (svgEl) {
    normalizeSvgSize(svgEl, getSvgDimensions(svgEl));
    fixDarkModeNodeContrast(svgEl);
  }
  createPanZoom();
  if (preserveView) {
    updateTransform();
  } else {
    window.requestAnimationFrame(() => fitToScreen());
  }
}
