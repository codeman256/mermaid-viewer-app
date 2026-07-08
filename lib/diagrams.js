const fs = require('fs');
const path = require('path');

// Recursively find .mmd files under `dir`, returning paths relative to `dir`
// using forward slashes (so subfolders are supported).
function listMmdFiles(dir, base = '') {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results = results.concat(listMmdFiles(path.join(dir, entry.name), relPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mmd')) {
      results.push(relPath);
    }
  }
  return results;
}

// Resolves a requested (relative) file path against `diagramsRoot`, the one
// real security boundary in this app. Returns the resolved absolute path if
// it's a `.mmd` file inside `diagramsRoot`, or null if the request should be
// rejected — e.g. "../../secret.mmd" style traversal, a non-.mmd extension,
// or a missing/non-string path.
function resolveDiagramPath(diagramsRoot, requested) {
  if (typeof requested !== 'string' || !requested.toLowerCase().endsWith('.mmd')) {
    return null;
  }
  const resolvedRoot = path.resolve(diagramsRoot);
  const filePath = path.resolve(resolvedRoot, requested);
  if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return filePath;
}

// Decodes a raw file buffer to text, sniffing the BOM to handle UTF-8,
// UTF-16 LE, and UTF-16 BE encodings (falls back to plain UTF-8 otherwise).
function decodeDiagramBuffer(buffer) {
  // UTF-16 LE BOM (FF FE)
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.toString('utf16le', 2);
  }
  // UTF-16 BE BOM (FE FF) — Node's Buffer has no native 'utf16be' encoding,
  // so byte-swap into LE order first, then decode as utf16le.
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const be = buffer.subarray(2);
    const le = Buffer.alloc(be.length);
    for (let i = 0; i + 1 < be.length; i += 2) {
      le[i] = be[i + 1];
      le[i + 1] = be[i];
    }
    return le.toString('utf16le');
  }
  // UTF-8 BOM (EF BB BF)
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8', 3);
  }
  // Plain UTF-8 (most common)
  return buffer.toString('utf8');
}

module.exports = { listMmdFiles, resolveDiagramPath, decodeDiagramBuffer };
