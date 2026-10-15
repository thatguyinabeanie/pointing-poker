#!/usr/bin/env bash
# Push the locally built Pointing Poker image to the registry. Run docker-build.sh first.
# Does not log in: run `docker login` yourself beforehand.
#
# Usage: scripts/docker-push.sh   (or: npm run image:push)
#
# Env overrides:
#   IMAGE_REPO   image repository (default: gabemendoza1/pointing-poker)
#   TAG          image tag (default: short git SHA of HEAD)
#
# Pushes $IMAGE_REPO:$TAG, plus :latest only from branch main with a clean tree.
set -euo pipefail
. "$(dirname "$0")/_common.sh"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not reachable. Start Docker Desktop and try again." >&2
  exit 1
fi

if ! docker image inspect "$IMAGE_REPO:$TAG" >/dev/null 2>&1; then
  echo "$IMAGE_REPO:$TAG is not built locally. Run scripts/docker-build.sh first." >&2
  exit 1
fi

docker push "$IMAGE_REPO:$TAG"

if docker image inspect "$IMAGE_REPO:latest" >/dev/null 2>&1; then
  if [ "$LATEST_OK" != "1" ]; then
    echo "Skipping :latest: it is only pushed from branch main with a clean tree (now: $BRANCH)." >&2
  elif [ "$(docker image inspect "$IMAGE_REPO:latest" --format '{{.Id}}')" \
    != "$(docker image inspect "$IMAGE_REPO:$TAG" --format '{{.Id}}')" ]; then
    # A leftover :latest from an older build would otherwise publish stale code.
    echo "Skipping :latest: it does not match $TAG. Rebuild on clean main." >&2
  else
    docker push "$IMAGE_REPO:latest"
  fi
fi

# One-line confirmation that linux/amd64 landed in the registry. A single-image manifest has no
# platform fields, so fall back to buildx imagetools, which resolves the platform from the config.
summary="$(docker manifest inspect "$IMAGE_REPO:$TAG" |
  grep -E '"(architecture|os)"' | tr -d ' \n' || true)"
case "$summary" in
  *amd64*) echo "$IMAGE_REPO:$TAG $summary" ;;
  *) echo "$IMAGE_REPO:$TAG $(docker buildx imagetools inspect "$IMAGE_REPO:$TAG" |
    grep -E '^ *Platform:' | tr -s ' ' | tr '\n' ' ')" ;;
esac
