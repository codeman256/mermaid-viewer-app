# Mermaid Diagram Viewer — Docker deployment

## Quick start

```bash
git clone <this project somewhere on your computer>
cd mermaid-viewer-docker
docker compose up -d --build
```

Then point your existing reverse proxy at `http://<host>:3000` (or whatever
port you set in `docker-compose.yml`). Since your proxy already handles auth,
the container itself is intentionally wide open — don't expose port 3000
directly to the internet without the proxy in front of it.

## Getting your diagrams repo into the container

Two options:

**Option A — let the container clone it for you (easiest)**
Set `GIT_REPO_URL` in `docker-compose.yml` to your repo's URL. On first
startup, if `./data/diagrams-repo` is empty, the app clones it there
automatically. After that, it just runs `git pull` on the interval you set.

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
schedule (`GIT_PULL_INTERVAL_MS`) and the browser refreshes live the moment
new files show up locally, whether they arrived via git pull or were dropped
straight into the mounted `./data/diagrams-repo` folder on the host.

## Notes

- `./data/diagrams-repo` on the host is a bind mount, so the cloned repo
  survives container rebuilds/restarts.
- A `/healthz` endpoint is included for Docker's `HEALTHCHECK` and works
  fine with docker container status indicator too.
- This same `server.js` also runs fine outside Docker (e.g. under IIS on
  Windows) — nothing here is Docker-specific except the Dockerfile itself.
