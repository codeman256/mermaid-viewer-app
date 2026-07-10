// Loads an optional, deployment-specific brand.custom.json if one exists
// on disk — see brand.custom.json.example for the shape. That real file is
// gitignored on purpose: it's meant to hold one company's actual colours,
// font and logo, which shouldn't end up committed to this app's own repo.
// Absent the file (the common case), the app looks exactly as it always
// has — this module no-ops entirely.

// Set by loadCustomBrand() if the config defines mermaid diagram colours;
// consulted by theme.js's initializeMermaidTheme().
let customMermaidOverrides = null;

function toDeclarations(vars) {
  return Object.entries(vars).map(([key, value]) => `${key}: ${value};`).join(' ');
}

// Custom properties are injected as real CSS rules (not inline styles) so
// the existing :root / html.dark cascade still works correctly — an inline
// style would always beat html.dark's rule and break the dark-mode toggle
// for anyone using a custom brand.
function injectCssVariables(cssVariables) {
  if (!cssVariables) return;
  let css = '';
  if (cssVariables.light) css += `:root { ${toDeclarations(cssVariables.light)} }\n`;
  if (cssVariables.dark) css += `html.dark { ${toDeclarations(cssVariables.dark)} }\n`;
  if (!css) return;
  const style = document.createElement('style');
  style.id = 'custom-brand-style';
  style.textContent = css;
  document.head.appendChild(style);
}

function injectCustomFonts(fontUrls) {
  (fontUrls || []).forEach((url, i) => {
    const id = `custom-brand-font-${i}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  });
}

function applyIdentity(config) {
  if (config.appName) {
    const nameEl = document.getElementById('app-name');
    if (nameEl) nameEl.textContent = config.appName;
    document.title = config.appName;
  }
  if (config.logoUrl) {
    const logoEl = document.getElementById('brand-logo');
    if (logoEl) {
      logoEl.src = config.logoUrl;
      logoEl.hidden = false;
    }
  }
}

export function getMermaidThemeOverrides(isDark) {
  if (!customMermaidOverrides) return null;
  return isDark ? customMermaidOverrides.dark : customMermaidOverrides.light;
}

export async function loadCustomBrand() {
  let config;
  try {
    const res = await fetch('brand.custom.json', { cache: 'no-store' });
    if (!res.ok) return;
    config = await res.json();
  } catch {
    return; // no custom brand file present, or it's not valid JSON — just use the app's own defaults
  }

  injectCssVariables(config.cssVariables);
  injectCustomFonts(config.fontUrls);
  applyIdentity(config);
  if (config.mermaidThemeVariables) {
    customMermaidOverrides = config.mermaidThemeVariables;
  }
}
