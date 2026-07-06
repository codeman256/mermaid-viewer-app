# Small, slim image with Node + git (git is needed for the auto-pull feature)
FROM node:20-alpine

RUN apk add --no-cache git openssh-client wget

WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# App code
COPY server.js ./
COPY public ./public

# Diagrams repo gets cloned in here at runtime (see GIT_REPO_URL) or bind-mount
# an already-cloned repo over this path via docker-compose.
RUN mkdir -p /app/diagrams-repo

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
