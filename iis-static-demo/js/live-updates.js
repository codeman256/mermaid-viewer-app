import { state } from './state.js';
import { liveDot } from './dom.js';

const STATIC_POLL_INTERVAL_MS = 15000;

// Live refresh, API mode: server pushes an event whenever the diagrams
// folder changes (new files added, git pull brought in updates, etc.)
function connectLiveUpdatesViaSse(onFilesChanged) {
  const es = new EventSource('api/events');
  es.onopen = () => liveDot.classList.add('connected');
  es.onerror = () => {
    liveDot.classList.remove('connected');
    // browser auto-reconnects EventSource; nothing else to do
  };
  es.addEventListener('files-changed', onFilesChanged);
}

// Live refresh, static mode: there's no server process to push anything,
// so instead poll manifest.json on an interval and compare it against what
// we last saw. Less immediate than SSE, but plenty for a diagram viewer.
function connectLiveUpdatesViaPolling(onFilesChanged) {
  let lastManifestRaw = null;
  liveDot.classList.add('connected');
  setInterval(async () => {
    try {
      const res = await fetch('manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const raw = await res.text();
      if (lastManifestRaw !== null && raw !== lastManifestRaw) {
        lastManifestRaw = raw;
        await onFilesChanged();
      } else {
        lastManifestRaw = raw;
      }
    } catch {
      // transient fetch failure — just try again next interval
    }
  }, STATIC_POLL_INTERVAL_MS);
}

export function connectLiveUpdates(onFilesChanged) {
  if (state.apiAvailable) {
    connectLiveUpdatesViaSse(onFilesChanged);
  } else {
    connectLiveUpdatesViaPolling(onFilesChanged);
  }
}
