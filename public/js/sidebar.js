import { sidebarEl, sidebarToggleBtn, sidebarBackdrop } from './dom.js';

// Off-canvas sidebar, only visible as an overlay below the mobile breakpoint
// (see the `#sidebar` media query in styles.css) — on wider screens these
// classes have no visual effect, so it's safe to call these unconditionally.
export function openSidebar() {
  sidebarEl.classList.add('open');
  sidebarBackdrop.classList.add('visible');
  sidebarToggleBtn.setAttribute('aria-expanded', 'true');
}

export function closeSidebar() {
  sidebarEl.classList.remove('open');
  sidebarBackdrop.classList.remove('visible');
  sidebarToggleBtn.setAttribute('aria-expanded', 'false');
}

// Called whenever a diagram is selected, regardless of trigger (sidebar tap,
// in-diagram link, browser back/forward, live-refresh reselect) — closing
// after a pick is the expected mobile pattern; a no-op if already closed.
export function closeSidebarOnMobile() {
  closeSidebar();
}

export function wireSidebarToggle() {
  sidebarToggleBtn.addEventListener('click', () => {
    if (sidebarEl.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  sidebarBackdrop.addEventListener('click', closeSidebar);
}
