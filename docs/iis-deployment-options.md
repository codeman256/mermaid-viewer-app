# Mermaid Viewer on Windows Server / IIS — Deployment Options for Review

**Purpose of this doc:** compare two ways to host this app on our IIS server, for a non-technical audience deciding what to approve installing. TL;DR up front, details below.

> **Status:** Both options are now implemented in this repo from the same codebase — nothing hypothetical below. The front-end (`public/index.html`) auto-detects at runtime whether it's talking to the Option A server or running as plain static files, and falls back accordingly. See `scripts/build-static.js` for the Option B build step.

## TL;DR

- **The app cannot run "as-is" with zero installs.** Someone with admin rights on the server needs to install **Node.js** and **iisnode** at minimum, one time, before this app will serve a single page. Just copying the files into a folder does nothing on its own — IIS will error out looking for a module that isn't there.
- **Recommendation: approve Node.js + iisnode + Git.** This keeps the app self-updating from our source repo automatically (every few minutes), instead of a person logging into the server and manually copying files — potentially multiple times a day if diagrams change often. That manual-copy alternative (Option B below) is a real fallback if IT won't approve installs, but it trades an ongoing task for a one-time install.

## Does copying the files onto the server "just work" if IIS is already running?

**No.** This is worth being explicit about, since it's the most common misconception here:

- `web.config` in this app tells IIS "hand every request to a module called iisnode." That module is a separate piece of software — an installer an admin runs once on the server. It is not bundled with Windows Server or with IIS.
- Node.js itself is also a separate install. iisnode hosts an already-installed Node runtime; it doesn't provide one.
- Without both of those installed first, the site won't start — IIS will return a configuration error (HTTP 500.19) because it can't find the handler `web.config` is pointing to.
- Once Node.js + iisnode + the IIS URL Rewrite Module are installed (a one-time setup task for whoever administers the server), copying this repo's files into the site folder is genuinely all that's needed — the `web.config` already included in the repo does the rest.

## Option A — Keep the app as-is (Node + iisnode + Git on the server)

**What it needs installed, once:** Node.js runtime, iisnode, IIS URL Rewrite Module, Git.

**Benefits:**
- **Self-updating.** The app polls our repo (`git pull`) on a timer (default every 5 minutes) and automatically picks up new/changed diagrams — no person needs to log into the server to push updates, even if diagrams change several times a day.
- **Live browser refresh.** Anyone with the page open sees new/changed diagrams appear automatically, no manual page refresh needed.
- **Lowest ongoing effort.** After the one-time install, this is a "set it and forget it" deployment — the operational burden moves from "a person copies files regularly" to "nothing, it's automatic."
- **No rework needed.** This is the exact setup already built and checked into the repo today (`web.config`, `server.js`) — nothing to redesign or re-test.

**Risks / costs:**
- Requires convincing IT/security to install and maintain three extra pieces of software on the server (Node.js, iisnode, Git), which may need a security review, patching cadence, etc.
- If those installs are denied or delayed, this option is simply unavailable until that changes.
- Slightly larger attack surface than a pure static site (a running Node process, plus whatever git-pull network access is required to reach the source repo).

## Option B — Convert to a static site (no Node, no Git, no Docker, ever)

**What it needs installed:** Nothing beyond IIS's built-in static file serving (already on). One small IIS config change: registering `.mmd` as a recognized static file type.

**How it would work:** The diagram rendering already happens entirely in the visitor's browser (via a JavaScript library) — the server today only lists files, serves them, and auto-syncs from git. All three of those jobs can be replaced with plain files: a small list file describing what diagrams exist, the diagram files themselves served as static content, and the browser periodically checking "did anything change" every 10–30 seconds instead of the server pushing updates instantly.

**Benefits:**
- **Zero install ask.** IIS already does everything required. Nothing new to get approved, patched, or maintained on the server.
- **Smallest possible attack surface** — no running application process at all, just files IIS hands out.
- **Fastest path to "live" on a locked-down server**, if installs are denied or take a long time to approve.

**Risks / costs:**
- **Someone (or something) still has to get new diagram files onto the server.** Since there's no Git and no automated process running there, updates become a manual copy step (or a scheduled copy job run from a *different* machine that still has Git) — which is exactly the "logging in and dropping files, possibly multiple times a day" workload we're trying to avoid.
- Auto-refresh becomes "check every 15 seconds" instead of instant push — a minor, not major, downgrade for this use case.

### How to build and deploy Option B

On any machine that still has Node.js and this repo checked out (a dev box, not the server):

```
npm run build:static
```

This writes a self-contained `dist-static/` folder: the front-end files, every
`.mmd` diagram copied in under `diagrams/`, a generated `manifest.json` (the
static stand-in for `/api/list`), and a `web.config` that registers `.mmd`
and `.json` as static MIME types — no iisnode, no URL Rewrite module. Copy
everything inside `dist-static/` into the IIS site's physical path and it's
live. Re-run the command and re-copy whenever diagrams change.

If no diagrams repo is configured (`GIT_REPO_DIR`/`DIAGRAMS_SUBDIR` unset or
empty), this falls back to the example diagrams bundled with the app
(`example-diagrams/`) so the build still produces something to look at
rather than erroring out — useful for a quick end-to-end check of the whole
pipeline before your real diagrams repo is ready.

**Note on the `.json` MIME type:** stock IIS has no built-in mapping for
`.json` — it 404s by default, even though `.mmd`/`.js`/`.css` all work out
of the box. `manifest.json` (and the optional `brand.custom.json` company
style, if you use one) depend on it, so the `web.config` this script
generates registers it explicitly. An earlier version of this script didn't,
which is exactly the kind of thing that looks like "IIS is just broken"
until you know to look for it.

`iis-static-demo/` at the repo root is exactly this build's output for the
bundled example diagrams, checked in so there's a zero-build way to confirm
Option B genuinely works before investing in your own diagrams repo — copy
its contents onto an IIS site, or run `npx serve iis-static-demo` locally.

## Recommendation

Given that diagrams may change multiple times a day, **Option A is the better ask**: request approval for Node.js, iisnode, and Git specifically (not Docker — that's not part of this path at all). The install is a one-time IT task; the payoff is that the app never again requires a person to manually push updates to the server. Option B is worth keeping in your back pocket as a fallback if that approval is denied or stalls for a long time — it can run today with nothing installed, at the cost of turning "automatic" back into "somebody has to copy files."
