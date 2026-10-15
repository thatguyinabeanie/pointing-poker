# Multi-stage Dockerfile for Pointing Poker (Fastify 5 serving a Vite-built React SPA).
# Node runs server/*.ts directly via built-in type stripping, so there is no server build.
#
# Stages:
#   base      - node:26-alpine, asserts the tag below hasn't drifted from .node-version.
#   deps      - full `npm ci` (incl. devDependencies), needed to run `vite build`.
#   deps-prod - production-only `npm ci --omit=dev` for the runtime image. vite still lands here
#               because it is a required peer of @fastify/vite, but nothing imports it at runtime.
#   build     - runs `vite build` into dist/ (dist/client + dist/vite.config.json).
#   runner    - the image that ships: non-root, port 3838, no HEALTHCHECK (the app serves
#               GET /api/status for the platform's health check instead).

FROM node:26-alpine AS base
WORKDIR /app

# .node-version is the single source of truth for the Node major version (bare major, e.g.
# "22", no "v" prefix -- see the repo's global constraints). Docker's FROM directive can't
# read a file at build time, so this asserts the hardcoded tag above hasn't drifted from
# that file instead of trying to parameterize FROM.
COPY .node-version ./.node-version
RUN set -eu; \
    expected="$(cat .node-version)"; \
    actual="$(node -e "console.log(process.versions.node.split('.')[0])")"; \
    if [ "$expected" != "$actual" ]; then \
      echo "Dockerfile base image (node:26-alpine) no longer matches .node-version ($expected). Update the FROM line." >&2; \
      exit 1; \
    fi

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3838

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps-prod --chown=app:app /app/node_modules ./node_modules

# All of dist/, not just dist/client: in production @fastify/vite reads the resolved config
# that the viteFastify plugin wrote to dist/vite.config.json at build time. That is also why
# vite.config.ts is not copied; production never loads it.
COPY --from=build --chown=app:app /app/dist ./dist

# package.json is needed at runtime: "type": "module", and @fastify/vite locates the app root
# by walking up to it.
COPY --chown=app:app package.json ./
COPY --chown=app:app server ./server
COPY --chown=app:app shared ./shared

# Recorded for traceability only; nothing in the build depends on its value.
ARG COMMIT_HASH_SHORT=unknown
LABEL org.opencontainers.image.revision=${COMMIT_HASH_SHORT}

USER app

EXPOSE 3838

CMD ["node", "server/index.ts"]
