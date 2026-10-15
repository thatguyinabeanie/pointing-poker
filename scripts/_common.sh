# Shared by docker-build.sh, docker-push.sh and docker-run.sh. Source it; do not execute it.
# Resolves the image name, the tag, and whether `latest` may be used (clean main only).

cd "$(dirname "$0")/.."

IMAGE_REPO="${IMAGE_REPO:-gabemendoza1/pointing-poker}"
SHA="$(git rev-parse --short HEAD)"
TAG="${TAG:-$SHA}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ -z "$(git status --porcelain)" ]; then
  TREE_CLEAN=1
else
  TREE_CLEAN=0
fi

# `latest` always means "clean main", so a dirty tree or a feature branch can never claim it.
if [ "$BRANCH" = "main" ] && [ "$TREE_CLEAN" = "1" ]; then
  LATEST_OK=1
else
  LATEST_OK=0
fi
