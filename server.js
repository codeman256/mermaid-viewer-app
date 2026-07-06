/**
 * Mermaid Diagram Viewer — server.js
 *
 * - Serves a small front-end that lists .mmd files and renders the selected one.
 * - Watches the diagrams folder and pushes a live-refresh event to open browser
 *   tabs whenever a file is added, removed, or changed (via Server-Sent Events).
 * - Periodically runs `git pull` inside GIT_REPO_DIR so the folder stays in sync
 *   with your repo without anyone needing to log in and pull manually.
 * - If GIT_REPO_DIR isn't a git repo yet and GIT_REPO_URL is set, it will
 *   clone it automatically on startup (handy for a fresh Docker container).
 *
 * Configure via environment variables (see .env.example), or just edit the
 * defaults below directly. This same file works whether you're running it
 * under IIS (iisnode) on Windows or in a plain Docker container on Linux.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { exec, execSync } = require('child_process');

const app = express();

// ---------------- Config ----------------
// IISNODE_PORT is injected automatically when running under iisnode.
const PORT = process.env.PORT || process.env.IISNODE_PORT || 3000;

// Folder that is the git repo (or contains it) — this is what gets `git pull`ed.
const REPO_DIR = process.env.GIT_REPO_DIR || path.join(__dirname, 'diagrams-repo');

// Optional: if REPO_DIR isn't a git repo yet, clone this URL into it on startup.
// e.g. https://github.com/you/diagrams.git or a git@ SSH URL.
const GIT_REPO_URL = process.env.GIT_REPO_URL || '';

// Where inside that repo the .mmd files actually live. Use "." if they're at
// the repo root, or e.g. "diagrams" if they're in a subfolder.
const DIAGRAMS_SUBDIR = process.env.DIAGRAMS_SUBDIR || '.';
const DIAGRAMS_DIR = path.join(REPO_DIR, DIAGRAMS_SUBDIR);

// How often to run `git pull`, in milliseconds. Default: 5 minutes.
const PULL_INTERVAL_MS = parseInt(process.env.GIT_PULL_INTERVAL_MS || '300000', 10);

// ---------------- Bootstrap: clone repo if it doesn't exist yet ----------------
const isGitRepo = fs.existsSync(path.join(REPO_DIR, '.git'));

if (!isGitRepo && GIT_REPO_URL) {
  console.log(`[git clone] ${REPO_DIR} is not a git repo yet — cloning ${GIT_REPO_URL} ...`);
  fs.mkdirSync(REPO_DIR, { recursive: true });
  try {
    execSync(`git clone "${GIT_REPO_URL}" .`, { cwd: REPO_DIR, stdio: 'inherit' });
    console.log('[git clone] done.');
  } catch (err) {
    console.error(`[git clone] failed: ${err.message}`);
  }
}

fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));

// ---------------- Live refresh via Server-Sent Events ----------------
let sseClients = [];

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
}

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

// ---------------- File listing / serving ----------------
app.get('/api/list', (req, res) => {
  fs.readdir(DIAGRAMS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Could not read diagrams folder' });
    res.json(files.filter((f) => f.toLowerCase().endsWith('.mmd')).sort());
  });
});

app.get('/api/file/:name', (req, res) => {
  const safeName = path.basename(req.params.name); // prevent path traversal
  if (!safeName.toLowerCase().endsWith('.mmd')) return res.status(400).send('Invalid file');
  const filePath = path.join(DIAGRAMS_DIR, safeName);
  
  // Read as binary buffer to detect and handle various encodings
  fs.readFile(filePath, (err, buffer) => {
    if (err) return res.status(404).send('File not found');
    
    let text = '';
    
    // Check for UTF-16 LE BOM (FF FE)
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      text = buffer.toString('utf16le', 2); // skip BOM
    }
    // Check for UTF-16 BE BOM (FE FF)
    else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      text = buffer.toString('utf16be', 2); // skip BOM
    }
    // Check for UTF-8 BOM (EF BB BF)
    else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      text = buffer.toString('utf8', 3); // skip BOM
    }
    // Try UTF-8 (most common)
    else {
      text = buffer.toString('utf8');
    }
    
    res.type('text/plain').send(text);
  });
});

// Simple health check — handy for Docker HEALTHCHECK / uptime monitors
app.get('/healthz', (req, res) => res.send('ok'));

// ---------------- Watch folder, notify connected browsers ----------------
const watcher = chokidar.watch(DIAGRAMS_DIR, { ignoreInitial: true, depth: 2 });
watcher
  .on('add', () => broadcast('files-changed'))
  .on('unlink', () => broadcast('files-changed'))
  .on('change', () => broadcast('files-changed'));

// ---------------- Auto git pull on a timer ----------------
function pullRepo() {
  exec('git pull', { cwd: REPO_DIR }, (err, stdout) => {
    if (err) {
      console.error(`[git pull] error: ${err.message}`);
      return;
    }
    if (stdout && !stdout.includes('Already up to date')) {
      console.log(`[git pull] ${stdout.trim()}`);
      // chokidar will pick up any resulting file changes and notify clients automatically
    }
  });
}

if (fs.existsSync(path.join(REPO_DIR, '.git'))) {
  pullRepo(); // run once at startup
  setInterval(pullRepo, PULL_INTERVAL_MS);
  console.log(`[git pull] auto-pulling every ${PULL_INTERVAL_MS / 1000}s from ${REPO_DIR}`);
} else {
  console.warn(
    `[git pull] ${REPO_DIR} is not a git repository — skipping auto-pull.\n` +
      `Set GIT_REPO_URL to auto-clone on startup, or clone it there manually.`
  );
}

app.listen(PORT, () => {
  console.log(`Mermaid viewer running on port ${PORT}`);
  console.log(`Watching: ${DIAGRAMS_DIR}`);
});
