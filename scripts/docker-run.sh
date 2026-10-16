#!/usr/bin/env bash
# Run the built image locally for a smoke test on port 3838.
#
# Usage: scripts/docker-run.sh   (or: npm run image:run)
#
# Env overrides:
#   IMAGE_REPO     image repository (default: gabemendoza1/pointing-poker)
#   TAG            image tag (default: short git SHA of HEAD)
#   IDENTITY_USER_ID_HEADER / IDENTITY_USERNAME_HEADER  header names (default: X-User-Id / X-Username)
#   HOST_BIND      host interface to publish on (default: 127.0.0.1; identity headers are trusted, so
#                  use 0.0.0.0 only on a trusted network)
#   JIRA_BASE_URL  Jira site URL (default: https://example.invalid, enough to boot)
#
# If a .env file exists it is passed with --env-file. This script never reads it.
set -euo pipefail
. "$(dirname "$0")/_common.sh"

# Example header names for the smoke test; a real deployment sets whatever its auth proxy injects.
IDENTITY_USER_ID_HEADER=${IDENTITY_USER_ID_HEADER:-X-User-Id}
IDENTITY_USERNAME_HEADER=${IDENTITY_USERNAME_HEADER:-X-Username}

args=(--rm -p "${HOST_BIND:-127.0.0.1}:3838:3838" -e "JIRA_BASE_URL=${JIRA_BASE_URL:-https://example.invalid}"
  -e "IDENTITY_USER_ID_HEADER=$IDENTITY_USER_ID_HEADER" -e "IDENTITY_USERNAME_HEADER=$IDENTITY_USERNAME_HEADER")
if [ -f .env ]; then
  args+=(--env-file .env)
fi
# Last -e wins over --env-file: a blank NODE_ENV in .env must not override the image's production mode.
args+=(-e NODE_ENV=production)

cat <<MSG
Smoke test from another terminal:
  curl -s localhost:3838/api/status
  curl -s -H "$IDENTITY_USER_ID_HEADER: 1" -H "$IDENTITY_USERNAME_HEADER: dev" localhost:3838/api/me
Ctrl+C stops the container.
MSG

# The image is linux/amd64; on Apple Silicon it runs under emulation.
exec docker run --platform linux/amd64 "${args[@]}" "$IMAGE_REPO:$TAG"
