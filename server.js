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
const { listMmdFiles, resolveDiagramPath, decodeDiagramBuffer } = require('./lib/diagrams');

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

// Optional: the externally-visible base URL, only needed if you sit this app
// behind a reverse proxy under a *different* hostname than the one Node sees,
// and want the Share button to always emit that canonical hostname regardless
// of which internal address was actually used to reach it. Not required for
// correctness — deep-links and in-diagram `click ... href "?file=..."` links
// are relative and already resolve correctly against whatever hostname the
// browser is actually on. e.g. "https://diagrams.example.com".
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

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
  try {
    res.json(listMmdFiles(DIAGRAMS_DIR).sort());
  } catch (err) {
    res.status(500).json({ error: 'Could not read diagrams folder' });
  }
});

app.get('/api/file', (req, res) => {
  const filePath = resolveDiagramPath(DIAGRAMS_DIR, req.query.path);
  if (!filePath) {
    return res.status(400).send('Invalid file');
  }

  // Read as binary buffer to detect and handle various encodings
  fs.readFile(filePath, (err, buffer) => {
    if (err) return res.status(404).send('File not found');
    res.type('text/plain').send(decodeDiagramBuffer(buffer));
  });
});

// Simple health check — handy for Docker HEALTHCHECK / uptime monitors
app.get('/healthz', (req, res) => res.send('ok'));

app.get('/api/config', (req, res) => res.json({ publicBaseUrl: PUBLIC_BASE_URL }));

// ---------------- Watch folder, notify connected browsers ----------------
// Debounced so a `git pull` touching many files at once results in a single
// reload notification instead of one per file.
let broadcastTimer = null;
function scheduleFilesChangedBroadcast() {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcast('files-changed');
  }, 400);
}

const watcher = chokidar.watch(DIAGRAMS_DIR, { ignoreInitial: true });
watcher
  .on('add', scheduleFilesChangedBroadcast)
  .on('unlink', scheduleFilesChangedBroadcast)
  .on('change', scheduleFilesChangedBroadcast)
  .on('addDir', scheduleFilesChangedBroadcast)
  .on('unlinkDir', scheduleFilesChangedBroadcast);

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
