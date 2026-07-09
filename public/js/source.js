import { state } from './state.js';

// Client-side mirror of lib/diagrams.js's decodeDiagramBuffer — only used
// in static mode (Option B), where there's no server to decode the file's
// encoding for us and we fetch the raw .mmd bytes directly.
function decodeDiagramBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Fetches the diagram list. Tries the dynamic API first (Option A); if
// that route doesn't exist (plain static hosting, Option B) falls back to
// the pre-generated manifest.json sitting next to this page. Sets
// state.apiAvailable so the rest of the app (live-updates, fetchDiagramSource)
// knows which mode it's in.
export async function fetchFileList() {
  try {
    const res = await fetch('/api/list');
    if (res.ok) {
      state.apiAvailable = true;
      return await res.json();
    }
  } catch {
    // fall through to static fallback
  }
  state.apiAvailable = false;
  const res = await fetch('manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load file list');
  return await res.json();
}

// Fetches one diagram's source. In API mode the server has already decoded
// its encoding for us; in static mode we fetch the raw bytes from
// /diagrams/<name> and decode client-side.
export async function fetchDiagramSource(name) {
  if (state.apiAvailable) {
    const res = await fetch('/api/file?path=' + encodeURIComponent(name));
    if (!res.ok) throw new Error('File not found on server');
    return await res.text();
  }
  const staticPath = 'diagrams/' + name.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(staticPath);
  if (!res.ok) throw new Error('File not found');
  return decodeDiagramBuffer(await res.arrayBuffer());
}
