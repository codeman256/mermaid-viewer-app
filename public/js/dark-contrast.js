// Diagram sources style individual nodes with explicit light `fill:` colors
// but never set text color, so node text is entirely theme-dependent. In
// dark mode, mermaid's default (light) text becomes unreadable against those
// explicitly light-filled nodes. Force dark text on light-filled nodes only
// — this touches the rendered DOM only, never the .mmd source.
const DARK_NODE_TEXT_COLOR = '#0f172a';
const LIGHT_FILL_LUMA_THRESHOLD = 128;

function parseRgb(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  const h = str.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    let hex = h[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

function isLight({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000 >= LIGHT_FILL_LUMA_THRESHOLD;
}

export function fixDarkModeNodeContrast(svgEl) {
  if (!document.documentElement.classList.contains('dark')) return;
  svgEl.querySelectorAll('g.node').forEach((g) => {
    const shape = g.querySelector('rect, polygon, circle, ellipse, path');
    if (!shape) return;
    const rgb = parseRgb(window.getComputedStyle(shape).fill);
    if (!rgb || !isLight(rgb)) return;
    const label = g.querySelector('.nodeLabel');
    if (label) label.style.color = DARK_NODE_TEXT_COLOR;
  });
}
