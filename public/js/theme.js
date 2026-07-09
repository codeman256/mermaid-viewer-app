import { state } from './state.js';
import { themeToggleBtn, diagramContainer } from './dom.js';
import { renderDiagram } from './render.js';

const THEME_STORAGE_KEY = 'mermaid-viewer-theme';

export function initializeMermaidTheme(theme) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: theme === 'dark' ? 'dark' : 'default',
    // On a parse error, mermaid's default behavior renders its own "bomb"
    // error graphic into a temporary DOM element that's only cleaned up on
    // the success path — left behind (and stacking up on repeated errors)
    // otherwise. We show our own error box (see selectFile/wireThemeToggle's
    // catch blocks), so tell mermaid to clean up and just throw instead.
    suppressErrorRendering: true,
    fontfamily: 'sans-serif, verdana, "trebuchet ms", arial;',
  });
}

export function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    themeToggleBtn.textContent = 'Light Mode';
    themeToggleBtn.setAttribute('aria-pressed', 'true');
  } else {
    document.documentElement.classList.remove('dark');
    themeToggleBtn.textContent = 'Dark Mode';
    themeToggleBtn.setAttribute('aria-pressed', 'false');
  }
}

function getSavedTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function wireThemeToggle() {
  themeToggleBtn.addEventListener('click', async () => {
    const isDark = document.documentElement.classList.toggle('dark');
    const theme = isDark ? 'dark' : 'light';
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    initializeMermaidTheme(theme);
    if (state.currentCode) {
      try {
        await renderDiagram(state.currentCode, { preserveView: true });
      } catch (err) {
        diagramContainer.innerHTML = '<pre class="error-box">Error rendering diagram:\n' + err.message + '</pre>';
      }
    }
  });

  const initialTheme = getSavedTheme();
  applyTheme(initialTheme);
  initializeMermaidTheme(initialTheme);
}
