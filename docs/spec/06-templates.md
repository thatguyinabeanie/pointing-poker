# Starter template survey for pointing-poker

Research date: 10/15/2026. Star counts and push dates come from the GitHub API on that date. "Last commit" below is the repo's last push date unless noted.

## Verdict

Nothing beats the current hand-rolled scaffold. Continue with it. The only platform contract that matters is small: the container listens on the configured port (`PORT`, default 3838) bound to 0.0.0.0, which the scaffold already does. The scaffold already has the exact combination we decided on (Fastify 5, @fastify/websocket 11, @fastify/vite 10 in spa mode, Vite 8, React 19, MUI 9, Biome 2, TS 7, Node type stripping, CircleCI plus CodeBuild buildspecs). No public template combines even three of those, and every candidate would need more ripping out than adding.

The one thing worth borrowing is small. The official @fastify/vite `react-typescript` starter is the only first-party reference for the Fastify to Vite wiring, and it is useful as a cross-check for our `viteFastify({ spa: true })` setup, not as a base.

Gap in the scaffold noticed during comparison (not a template finding): there is no Dockerfile at the root of ~/source/pointing-poker yet, though `buildspec/` exists. Confidence high; I listed the directory and `cat Dockerfile` failed.

## Comparison table

| Candidate | URL | Last push | Stars | License | Fit (1-5) | Short reason |
|---|---|---|---|---|---|---|
| fastify-vite `starters/react-typescript` | https://github.com/fastify/fastify-vite/tree/dev/starters/react-typescript | 07/29/2026 (path commit) | 1126 (repo) | MIT | 2 | Right framework, wrong shape: SSR via @fastify/react, tsx, tsc build, Tailwind, router, valtio |
| fastify-vite `starters/react-base` | https://github.com/fastify/fastify-vite/tree/dev/starters/react-base | 10/14/2026 (repo) | 1126 (repo) | MIT | 1 | Plain JS, same SSR layer |
| fastify-vite `react-kitchensink` | same dir listing | 10/14/2026 (repo) | 1126 (repo) | MIT | 1 | Demo routes and context, none of it needed |
| `create-vite` template `react-ts` | https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts | 10/15/2026 | 83318 (repo) | MIT | 2 | Client half only, and we already have it; no MUI |
| `create-fastify` / `fastify-cli generate` | https://github.com/fastify/create-fastify | 08/05/2026 | 145 | MIT | 1 | Autoload plugin layout and tap tests; no Vite, no Biome, no type stripping |
| Shyam-Chen/Fastify-Starter | https://github.com/Shyam-Chen/Fastify-Starter | 05/19/2026 | 85 | none listed | 1 | Mongo and Docker/Caddy oriented, pnpm, no React client in this repo |
| Sairyss/fullstack-starter-template | https://github.com/Sairyss/fullstack-starter-template | 10/27/2023 | 337 | none | 1 | Stale, DB-centric |
| christopher-caldwell/vite-material-ui | https://github.com/christopher-caldwell/vite-material-ui | 05/16/2023 | 47 | MIT | 1 | Stale, old MUI |
| jooy2/retron | https://github.com/jooy2/retron | 09/07/2026 | 53 | MIT | 1 | Electron app template, not a web service |
| Poker ref: hellomuthu23/planning-poker | https://github.com/hellomuthu23/planning-poker | 10/02/2026 | 348 | MIT | ideas only | React 17, Firebase 8, Vite 5 |
| Poker ref: spokvulcan/poker-planning | https://github.com/spokvulcan/poker-planning | 10/13/2026 | 115 | MIT | ideas only | Next 16, Convex, React 19 |
| Poker ref: agustinusnathaniel/spoker | https://github.com/agustinusnathaniel/spoker | 10/01/2026 | 65 | MIT | ideas only | Next.js, Biome, Turbo |

## Per-candidate notes

### Official: fastify-vite starters (react-typescript, react-base, react-kitchensink)

What it gives us: the reference shape for `vite.config` plus a Fastify server using `@fastify/vite` 10 and `@vitejs/plugin-react` 6 with Vite 8. The `react-typescript` package.json confirms the same major versions we use for fastify (^5), @fastify/vite (^10), Vite (^8) and plugin-react (^6).

What we would rip out: `@fastify/react` (the SSR/routing layer), `react-router`, `valtio`, `@unhead/react`, `history`, `minipass`, Tailwind and PostCSS, `tsx` (we use Node type stripping), and the `tsc` server build (we run .ts directly). It also pins `@types/node` ^22 and TypeScript ^5.9, both behind our decisions. After that removal nothing would be left that we do not already have.

Notable finding: the @fastify/vite docs page (vite.fastify.dev/react/) has no SPA-only setup guide and says nothing about TypeScript or WebSockets. Our `viteFastify({ spa: true })` setup is therefore not covered by any official starter. I did not verify the spa-mode behavior against the @fastify/vite source; that is worth a quick check with context7 if the production image behavior is in doubt.

Fit: 2 for react-typescript, 1 for the others.

### Official: create-vite react-ts

Gives a `tsconfig` trio, a basic `index.html`, and an ESLint config we do not want (we use Biome). Our `client/` is already past this. Fit 2, and only as a diff target if someone wants to confirm tsconfig defaults for Vite 8. I did not fetch its file contents, so I cannot say what it currently ships.

### Official: create-fastify and fastify-cli generate

Generates a server plugin layout with autoload and tests. The brief says no tests, no DB, and Node type stripping; this generator targets a different layout. I did not inspect its current TypeScript output, so treat the details as unverified. Fit 1.

### Community boilerplates

Searches returned no repo that combines Fastify, a WebSocket plugin, Vite, React and MUI. The closest by name are Sairyss/fullstack-starter-template (337 stars, no license, last push 10/27/2023, stale), Shyam-Chen/Fastify-Starter (85 stars, no license shown, server-only, Mongo oriented), and a web hit for "FastRat" that I could not locate on GitHub by search, so I have no metadata for it. For MUI, the Vite templates found are either stale (vite-material-ui, 2023) or unrelated (retron is Electron). I did not open any of these beyond the top-level file listing, so fit scores of 1 reflect scope mismatch and staleness, not a code review.

### Poker reference implementations (ideas only)

Top three by stars among TypeScript results, all MIT, none use our stack:
1. hellomuthu23/planning-poker, 348 stars, MIT. React 17 with Firebase 8 and Vite 5. Useful for UX ideas: deck choices, reveal and reset flow, countdown.
2. spokvulcan/poker-planning, 115 stars, MIT. Next 16 and Convex backend, so realtime comes from Convex rather than WebSockets. It also carries Claude and agent config files, which are not relevant here.
3. agustinusnathaniel/spoker, 65 stars, MIT. Next.js, Biome, Turbo.

Closest in transport to ours: amwebexpert/ws-poker-planning (2 stars, Apache-2.0, last push 01/07/2026), a WebSocket-only server for poker sessions. Too small to rank, but its message protocol is a possible cross-check against `shared/protocol.ts`. I did not read any of its code.

None include a Jira client. All are MIT or Apache-2.0, so borrowing ideas is license-safe; copying code would need attribution.

## Confidence and gaps

High confidence: star counts, push dates, licenses (API data), the fastify-vite starter dependency lists, and the verdict.

Lower confidence: anything marked "did not inspect" above, and the claim that no better community template exists. GitHub keyword search is shallow, and I used one web search that returned few useful hits. An extended web search could surface a repo the keyword search missed, but given the stack specificity I would not expect one to change the verdict.
