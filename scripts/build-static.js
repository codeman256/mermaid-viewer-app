/**
 * build-static.js — packages this app as a plain static site (Option B).
 *
 * Produces a folder that a bare IIS install (or any static file host) can
 * serve with no Node, git, or Docker on that machine at all. Run this
 * wherever Node + git already live (a dev box, a build agent) whenever the
 * diagrams change, then copy the output folder's contents onto the server.
 *
 * Usage:
 *   node scripts/build-static.js
 *   npm run build:static
 *
 * Reads the same env vars as server.js (GIT_REPO_DIR, DIAGRAMS_SUBDIR) so
 * both deployment paths (Option A's server.js and this static build) point
 * at the same diagrams folder without needing separate configuration.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { listMmdFiles } = require('../lib/diagrams');

const ROOT = path.join(__dirname, '..');
const REPO_DIR = process.env.GIT_REPO_DIR || path.join(ROOT, 'diagrams-repo');
const DIAGRAMS_SUBDIR = process.env.DIAGRAMS_SUBDIR || '.';
const DIAGRAMS_DIR = path.join(REPO_DIR, DIAGRAMS_SUBDIR);
const OUT_DIR = process.env.STATIC_OUT_DIR || path.join(ROOT, 'dist-static');

const STATIC_WEB_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <!-- Option B (static) deployment: plain file serving only. No iisnode,
         no URL Rewrite module, no Node.js needed on this server. This just
         registers .mmd as a known static file type, since IIS returns 404
         for unregistered extensions by default. -->
    <staticContent>
      <mimeMap fileExtension=".mmd" mimeType="text/plain" />
    </staticContent>
  </system.webServer>
</configuration>
`;

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    console.error(`Diagrams folder not found: ${DIAGRAMS_DIR}`);
    console.error('Set GIT_REPO_DIR/DIAGRAMS_SUBDIR, or clone your diagrams repo there first.');
    process.exit(1);
  }

  rmrf(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Front-end: same files Option A serves from /public (including the js/
  // subfolder) — the front-end code detects at runtime whether /api/* is
  // reachable and falls back to manifest.json + static /diagrams files when
  // it isn't.
  const publicDir = path.join(ROOT, 'public');
  fs.cpSync(publicDir, OUT_DIR, { recursive: true });

  // Diagrams, flattened into the output's diagrams/ folder, preserving
  // subfolder structure so links like "?file=sub/other.mmd" keep working.
  const files = listMmdFiles(DIAGRAMS_DIR).sort();
  for (const relPath of files) {
    copyFile(path.join(DIAGRAMS_DIR, relPath), path.join(OUT_DIR, 'diagrams', relPath));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(files, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'web.config'), STATIC_WEB_CONFIG);

  console.log(`Built static site: ${OUT_DIR}`);
  console.log(`  ${files.length} diagram(s) included.`);
  console.log('');
  console.log('To deploy: copy everything inside that folder into your IIS');
  console.log("site's physical path. Nothing else needs to be installed there —");
  console.log('no Node.js, no iisnode, no URL Rewrite module, no git, no Docker.');
  console.log('');
  console.log('Re-run this script (and re-copy the output) whenever the diagrams change.');
}

main();
