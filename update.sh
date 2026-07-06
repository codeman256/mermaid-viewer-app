#!/bin/bash
# update.sh — pulls the latest app code from git and rebuilds/restarts the container.
#
# Run manually whenever you push a code change, e.g.:
#   ./update.sh
#
# Or schedule it (e.g. via Unraid's User Scripts plugin) to run every few
# minutes / hourly / nightly if you want the app itself to also self-update.

set -e
cd "$(dirname "$0")"

echo "Pulling latest app code..."
git pull

echo "Rebuilding and restarting container..."
docker compose up -d --build

echo "Done."
