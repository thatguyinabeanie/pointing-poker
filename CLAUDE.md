# CLAUDE.md

Pointing Poker is a Fastify 5 server with a Vite React client. You are the build session. Build it from the spec bundle in `docs/spec/`.

## Start here

1. Read `docs/spec/00-README.md`, then `docs/spec/05-build-plan.md`. Work one build step at a time.
2. Toolchain: run `mise trust && mise install`. This machine's Node may be 24, but the repo wants 26 (`.node-version`).
3. The user runs `cp docs/spec/env-example.txt .env.example`. Claude cannot write `.env*` files in this repo.

## Commands

- `npm run dev`: Fastify hosts Vite in-process on port 3838.
- `npm run build`, `npm run lint`, `npm run tsc:check`.
- No tests in v1 (decision in `docs/spec/08-decision-log.md`). Do not add test files or a test script.

## Rules and working style

- Identity comes only from the auth proxy's identity headers (names come from `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`). Never take it from a message body.
- The server runs `.ts` files directly under Node 26. Use erasable syntax only (no `enum`, `namespace`, or parameter properties) and explicit `.ts` import extensions.
- Editing `.env` does not restart the dev server. Restart it by hand after a change.
- The repo is `thatguyinabeanie/pointing-poker` (private, personal space). Pushing a new feature branch does not need a prompt. Never force-push, and never push to `main` directly once the first PR exists.
- Use subagents named `[Model] task`, for example `[Sonnet 5.5] client components`, with cheaper models for narrow scopes. The full CLAUDE.md is produced in build step 6 from `docs/spec/drafts/CLAUDE.md`; until then, this file is the short version.
