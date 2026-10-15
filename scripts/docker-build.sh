#!/usr/bin/env bash
# Build the Pointing Poker image for linux/amd64 (what the hosting platform runs), even on Apple Silicon.
#
# Usage: scripts/docker-build.sh   (or: npm run image:build)
#
# Env overrides:
#   IMAGE_REPO   image repository (default: gabemendoza1/pointing-poker)
#   TAG          image tag (default: short git SHA of HEAD)
#   ALLOW_DIRTY  set to 1 to build from a dirty working tree (never tagged `latest`)
#
# Tags: always $IMAGE_REPO:$TAG. Also :latest, only when on branch main with a clean tree.
set -euo pipefail
. "$(dirname "$0")/_common.sh"

if [ "$TREE_CLEAN" = "0" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "Working tree has uncommitted changes. Commit them, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

tags=(-t "$IMAGE_REPO:$TAG")
if [ "$LATEST_OK" = "1" ]; then
  tags+=(-t "$IMAGE_REPO:latest")
fi

# Single platform, so --load can put the image in the local Docker daemon.
docker buildx build \
  --platform linux/amd64 \
  --build-arg "COMMIT_HASH_SHORT=$SHA" \
  "${tags[@]}" \
  --load \
  .

echo "Built:"
echo "  $IMAGE_REPO:$TAG"
if [ "$LATEST_OK" = "1" ]; then
  echo "  $IMAGE_REPO:latest"
else
  echo "(not tagged latest: needs branch main and a clean tree)"
fi
