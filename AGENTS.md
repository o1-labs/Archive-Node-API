# AGENTS.md

Orientation for AI coding agents (Claude Code, Cursor, Copilot, Aider, etc.) working in this repo. Human contributors should start at [`README.md`](./README.md); this file is the agent-facing complement.

## What this project is

A Node.js / TypeScript GraphQL server (`graphql-yoga` + `@envelop/*`) that exposes Mina archive-node data — blocks, events, actions, transactions — for o1js / zkApp developers. It is a **read-side API over an existing Postgres database**; it does not ingest chain data itself.

Distributed as:

- npm (public, scoped): `@o1-labs/mina-archive-node-graphql` — bin: `mina-archive-node-graphql`
- Docker (GHCR): `ghcr.io/o1-labs/archive-node-api`

## Layout

| Path | Contents |
| --- | --- |
| `src/index.ts` | Entry point. |
| `src/resolvers.ts` | GraphQL resolvers — top-level dispatch into services. |
| `src/services/` | Per-domain query layers: `events-service`, `actions-service`, `blocks-service`, `network-service`, `data-adapters`. |
| `src/db/` | Postgres access (uses [`postgres`](https://www.npmjs.com/package/postgres)). `archive-node-adapter/` and `sql/`. |
| `src/server/` | Yoga + Envelop wiring (`server.ts`, `plugins.ts`). |
| `src/tracing/` | OpenTelemetry / Jaeger setup. |
| `src/consensus/` | Chain-status / canonicality logic. |
| `src/blockchain/` | Domain types shared across services. |
| `src/errors/` | Typed error classes. |
| `src/envionment.d.ts` | **Typo in filename** — leave as-is. Declares `ProcessEnv` for env vars. |
| `src/resolvers-types.ts` | **Generated** — do not hand-edit. Run `npm run codegen` after schema changes. |
| `schema.graphql` | Source of truth for the GraphQL schema. |
| `tests/unit/` | Unit tests, no DB. |
| `tests/integration/` | Static-dump integration tests. |
| `tests/devnet-dump/` | Tests against a real devnet archive dump (long-running). |
| `tests/live-network/` | Hits external networks — not part of routine CI. |
| `benchmark/` | Lightnet setup script + Artillery config. |
| `scripts/` | DB snapshot download, libp2p keygen, Jaeger init, Compose helper. |
| `docs/getting-started.md` | User-facing setup guide (three install paths). |

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Hot-reload dev server, reads `.env`. |
| `npm run build` | Compile TypeScript to `build/`. |
| `npm run start` | Run the compiled server. |
| `npm run lint` | ESLint over `*.ts`. Treat its output as authoritative for style. |
| `npm run format` | Prettier write. |
| `npm run test:unit` | Unit tests — no DB required. Fast. **Use this before declaring a change green.** |
| `npm run test:integration` | Integration against a static archive DB dump. |
| `npm run test` | Full suite — **requires a running Lightnet** with seeded zkApp data. Don't run in agent environments without it. |
| `npm run codegen` | Regenerate `src/resolvers-types.ts` from `schema.graphql`. **Run after every schema edit.** |
| `npm run benchmark` | Artillery load test (needs running server + Lightnet). |

## Required environment

`PG_CONN` is the only required env var; default port is `8080`. Full table in [`docs/getting-started.md#configuration`](./docs/getting-started.md#configuration). When adding a new env var, update three places:

1. `src/envionment.d.ts` — type declaration.
2. `.env.example.compose` — example value.
3. `docs/getting-started.md#configuration` — table row.

## Constraints and gotchas

- Node version is pinned by Volta to **20.18.0** (`package.json#volta.node`). The package targets Node ≥ 20; `--env-file` flag and modern ESM behavior assumed.
- `package.json` is `"type": "module"` — use ESM imports throughout, including the `.js` extension on relative imports of TS-compiled sources.
- The bin entry has a shebang in `build/src/index.js`; do not strip it. (See commit `8052799` — broken bin in the past.)
- The npm package ships only what is in `package.json#files`: `build`, `src`, `schema.graphql`, `README.md`, `tsconfig.json`. New runtime assets must be added there or they won't reach published consumers.
- The package is scoped (`@o1-labs/...`) and published from CI on tag push with `--provenance`. Workflow lives at `.github/workflows/publish-npm.yml` — changes there affect the supply chain.
- Tests under `tests/live-network/` and `tests/devnet-dump/` hit external resources and are intentionally outside `npm run test:unit`. Don't fold them into routine CI.
- The default port is **`8080`**, not `3000`. Old docs sometimes say otherwise.

## Where to look first

| Task | Start here |
| --- | --- |
| New GraphQL field or query | `schema.graphql` → `npm run codegen` → `src/resolvers.ts` → matching `src/services/<domain>/`. |
| New DB query | `src/db/sql/`. |
| New env var | `src/envionment.d.ts` + `.env.example.compose` + `docs/getting-started.md#configuration`. |
| Setup / install behavior | `docs/getting-started.md` is the single source of truth. README links to it; don't duplicate. |
| Tracing change | `src/tracing/` and the Envelop plugin in `src/server/plugins.ts`. |

## Doc-editing rules

- README is a landing page — keep it under ~100 lines. Long-form setup belongs in `docs/getting-started.md`.
- Setup detail (env vars, install paths, Compose flow) lives **only** in `docs/getting-started.md`. The README should link, not duplicate.
- When updating env-var or command tables, update them in **both** `README.md` (short list) and `docs/getting-started.md` (full list) — but only if the change affects the short list. Most additions only need the full list.
