# Mermaid Diagram Viewer — Docker deployment

## Quick start

```bash
git clone <this project somewhere on your computer>
cd mermaid-viewer-docker
docker compose up -d --build
```

That's it — no other configuration needed. With `GIT_REPO_URL` unset, the
app seeds itself from this repo's own bundled `example-diagrams/` on first
run, so you get a working sidebar full of sample diagrams immediately
instead of an empty screen. Point `GIT_REPO_URL` at your own diagrams repo
(see below) whenever you're ready to replace them.

Then point your existing reverse proxy at `http://<host>:3000` (or whatever
port you set in `docker-compose.yml`). Since your proxy already handles auth,
the container itself is intentionally wide open — don't expose port 3000
directly to the internet without the proxy in front of it.

## Getting your own diagrams repo into the container

Two options:

**Option A — let the container clone it for you (easiest)**
Set `GIT_REPO_URL` in `docker-compose.yml` to your repo's URL. On first
startup, if `./data/diagrams-repo` is empty, the app clones it there
automatically. After that, it just runs `git pull` on the interval you set.
`example-diagrams/` in *this* repo is a reasonable starting template for how
to structure that separate diagrams repo (flat `.mmd` files, optionally in
subfolders).

**Option B — clone it yourself once, ahead of time**
```bash
git clone https://github.com/your-org/your-diagrams-repo.git ./data/diagrams-repo
```
Then you can leave `GIT_REPO_URL` unset — the app will just detect it's
already a git repo and start auto-pulling.

## Git authentication for private repos

- **HTTPS + token (simplest):** use a URL like
  `https://<token>@github.com/your-org/your-diagrams-repo.git` as `GIT_REPO_URL`.
  GitHub/GitLab/Bitbucket all support personal access tokens this way.
  Since this token ends up in your `docker-compose.yml`, treat that file as
  a secret (don't commit it to a public repo).

- **SSH key:** uncomment the SSH volume mount in `docker-compose.yml`
  (`~/.ssh:/root/.ssh:ro`) and use a `git@github.com:...` style URL. Make
  sure the mounted key doesn't require a passphrase, since there's no
  interactive prompt inside the container.

## Updating the diagrams without redeploying

Nothing to redeploy — just push to the repo. The container polls on its own
schedule (`GIT_PULL_INTERVAL_MINUTES`, default 5) and the browser refreshes
live the moment new files show up locally, whether they arrived via git pull
or were dropped straight into the mounted `./data/diagrams-repo` folder on
the host.

## Running with no Node at all (plain IIS / static hosting)

If Node can't be installed on the target server, `npm run build:static`
packages the whole app — front-end, diagrams, and a `manifest.json` standing
in for the API — into a folder that any bare static file host can serve with
nothing else installed. See `docs/iis-deployment-options.md` for the full
comparison.

`iis-static-demo/` in this repo is exactly that output, pre-built from the
bundled `example-diagrams/` — copy its contents straight onto an IIS site (or
run `npx serve iis-static-demo`) to see it work with zero setup. When you're
ready to deploy your own diagrams, run `npm run build:static` again with
`GIT_REPO_DIR` pointed at your real diagrams repo and copy *that* output
instead — re-run and re-copy whenever the diagrams change.

One easy-to-miss gotcha this generated `web.config` now handles: stock IIS
has no built-in MIME type for `.json`, so `manifest.json` (and an optional
`brand.custom.json`, see below) would silently 404 without an explicit
`<mimeMap>` entry for it, even though `.mmd`/`.js`/`.css` all work fine
out of the box.

## Notes

- `./data/diagrams-repo` on the host is a bind mount, so the cloned repo
  survives container rebuilds/restarts.
- A `/healthz` endpoint is included for Docker's `HEALTHCHECK` and works
  fine with docker container status indicator too.
- This same `server.js` also runs fine outside Docker (e.g. under IIS on
  Windows) — nothing here is Docker-specific except the Dockerfile itself.

## TODO

- [x] The "Open in mermaid.live" button always sends `theme: 'default'` in the
  encoded state — have it pass `'dark'` when the app is in dark mode, so the
  diagram opens on mermaid.live matching what's currently on screen.
- [ ] Add a "Copy raw source" button next to Share/Open-in-mermaid.live, so the
  plain `.mmd` text can be copied without opening the file in an editor.
- [ ] Add a download-as-SVG (or PNG) button — the rendered SVG is already sitting
  in the DOM (`#diagram-viewport svg`), so this is mostly a Blob + `<a
  download>` away.
- [ ] The live-connection indicator is just a small dot (`#live-dot`) that goes
  grey on disconnect; consider a more visible banner if the SSE connection
  drops for an extended period, since a stale diagram could otherwise go
  unnoticed.
- [ ] File filtering (`#file-search`) is a plain substring match — fine for now,
  but would benefit from fuzzy matching once the diagram list gets large.
- [x] No automated tests exist for `server.js` (path-traversal guard, encoding
  detection, `.mmd` listing) or the front-end — worth at least covering the
  path-traversal check in `/api/file` given it's the one real security
  boundary in this app.
  - (Path-traversal guard, `.mmd` listing, and encoding detection now covered
  in `test/diagrams.test.js` via `npm test` — logic extracted into
  `lib/diagrams.js` to make it testable without booting Express/git/chokidar.
  Also fixed a real bug found while writing the encoding tests: the UTF-16 BE
  branch used `buffer.toString('utf16be', ...)`, which isn't a real Node
  Buffer encoding and threw instead of decoding. Front-end still untested.)
- [ ] Consider remembering the last-viewed file per browser (`localStorage`) so
  reloading the app without a `?file=` query param returns to the last
  diagram instead of the empty state.
- [x] Mobile support: the sidebar previously took up 300px on any screen size
  with no way to hide it, and pan/zoom only ever tracked a single pointer, so
  a second finger caused erratic jumps instead of pinch-zoom.
  - Sidebar now collapses into a hamburger menu below 768px width (slides in
    as an overlay with a tap-to-dismiss backdrop, auto-closes on selecting a
    diagram). Pan/zoom now tracks all active pointers, so two fingers pinch-
    zoom around their midpoint while one finger still pans as before. Also
    added the `<meta name="viewport">` tag the app was missing entirely —
    without it mobile browsers render at a virtual desktop width and the new
    breakpoint never triggers. Trade-off: an in-diagram link tap right after
    a pinch gesture may occasionally not register, to keep the gesture
    detection simple.
- [x] Add the ability to reskin the app with a deployment-specific company
  style, instead of the look being hardcoded — the colours, font and even
  the mermaid diagram's own colours were all baked into `styles.css`/
  `theme.js` directly, with no way to customize them per deployment.
  - The app now looks for an optional `public/brand.custom.json` at startup
    (`brand.js`) and, if present, injects its colours as real CSS custom
    property overrides (`--accent`, `--bg`, `--font-body`, etc. — see the
    `:root`/`html.dark` variables in `styles.css`), loads any font URLs it
    lists, swaps the sidebar app name/logo, and recolours the mermaid
    diagram itself via `theme.js`'s `getMermaidThemeOverrides()`. Absent the
    file — the default case — the app looks exactly as it always has.
  - `public/brand.custom.json` is deliberately gitignored: it's meant to
    hold one deployment's real colours/font/logo, which shouldn't be
    committed to this repo. `public/brand.custom.json.example` is checked in
    as a documented (fictional-company) template showing the exact shape.
- [x] Onboarding a fresh clone required a separate diagrams repo just to see
  the app do anything, and getting the Option B (static/no-Node) build
  working on a real IIS box required hand-editing the generated `web.config`
  and `manifest.json` — the build's own output didn't actually work as-is.
  - Bundled a set of example `.mmd` files directly in this repo
    (`example-diagrams/`) — `server.js` and `build-static.js` both now fall
    back to it automatically whenever no diagrams repo is configured, so a
    completely unconfigured `docker compose up` (or `node server.js`, or
    `npm run build:static`) shows a working demo instead of an empty sidebar
    or a build error. It also doubles as a template for structuring your own
    separate diagrams repo.
  - Root-caused the actual IIS bug: the generated static `web.config` only
    ever registered `.mmd` as a MIME type. Stock IIS has no built-in mapping
    for `.json`, so `manifest.json` 404s there by default even though
    `.mmd`/`.js`/`.css` all work out of the box — added the missing
    `<mimeMap>` entry so the build's own output works unmodified.
  - Pre-built and committed `iis-static-demo/`, the `build:static` output for
    the bundled example diagrams, so testing the no-Node path needs zero
    build step at all — just copy that folder onto IIS (or `npx serve` it).
    Verified end-to-end with a real browser against plain nginx (no
    Node/Express involved) — file listing, diagram rendering, and the
    manifest-polling live-refresh fallback all work correctly.
  - Also renamed `GIT_PULL_INTERVAL_MS` to `GIT_PULL_INTERVAL_MINUTES` (e.g.
    `5` instead of `300000`) across `server.js`, `docker-compose.yml`, and
    `.env.example` — nobody should have to do millisecond math to set a poll
    interval.