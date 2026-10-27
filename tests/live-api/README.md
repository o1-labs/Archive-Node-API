# Live API Tests

Integration tests that run against a live (or staging) Archive Node API instance. Unlike the unit tests and lightnet-based resolver tests, these tests hit a real deployed endpoint and optionally query a real Postgres database.

## Why

Unit tests validate internal logic in isolation, but they cannot catch issues that only surface when talking to a real API backed by real archive data -- query planner regressions, schema drift between the GraphQL layer and the database, incorrect handling of actual chain data (pending vs canonical blocks), or subtle differences in how events/actions look on mainnet compared to test fixtures.

These tests give us confidence that the API behaves correctly against production-shaped data before we promote a release.

## What is tested

| Test file              | Coverage |
|------------------------|----------|
| `events.test.ts`       | Queries events by address and block range, compares against known fixtures. Optionally tests pending-chain events when a DB connection is available. |
| `networkState.test.ts` | Fetches `networkState` and verifies the gap between canonical and pending max block height matches the consensus parameter K (290). |
| `actions.test.ts`      | Placeholder -- needs mainnet ZkApps with actions to build fixtures against. |

## Environment variables

| Variable                     | Required | Description |
|------------------------------|----------|-------------|
| `STAGING_GRAPHQL_ENDPOINT`   | Yes      | URL of the API to test. There is no default; the suite fails at load without it. |
| `PG_CONN`                    | No       | Postgres connection string. Only needed for pending-chain event tests that discover ZkApp addresses with pending data. Tests still work without it (pending suite is skipped). |

## Running

Live API tests are **skipped by default** in the normal test suite. To run them:

```bash
# Run the full suite, live-api tests included
STAGING_GRAPHQL_ENDPOINT=http://localhost:8080 LIVE_API_TESTS=true npm test

# Include pending-chain tests (requires DB access)
STAGING_GRAPHQL_ENDPOINT=http://localhost:8080 PG_CONN=postgresql://user:pass@host:5432/archive LIVE_API_TESTS=true npm test

# Run just the live-api suite directly against an endpoint
STAGING_GRAPHQL_ENDPOINT=https://my-archive-api npm run test:live-api
```

## Nightly multi-network runs (CI)

The [`Live Integration`](../../.github/workflows/live-integration.yaml) workflow
runs this suite nightly against **devnet and mainnet** to catch schema or
query drift against each network's real data without slowing the PR loop. These
are the only two live networks; mesa, used to prepare the hard fork, no longer
exists.

Each network's endpoint is read from a repository secret, so Actions masks it
in the (public) run logs. A network with no configured URL fails its job rather
than being skipped, so a green run always means the suite ran:

| Repo secret | Network |
|-------------|---------|
| `DEVNET_ARCHIVE_API_URL`  | devnet |
| `MAINNET_ARCHIVE_API_URL` | mainnet |

The values are the archive-node-api hosts deployed by `gitops-infrastructure`.
Set them under **Settings → Secrets and variables → Actions → Secrets**, then
trigger the workflow manually from the Actions tab to check them.

> Note: `actions.test.ts` is still a placeholder — it needs a known mainnet
> zkApp with actions to snapshot fixtures against. Filling that in (and adding a
> successful-`zkappCommands` fixture) is the remaining piece of test coverage.

## Fixtures

The `fixtures/` directory contains expected responses snapshotted from known-good API output. Each fixture file is named `<address>_<from>_<to>.json` corresponding to the query parameters used.

When the API output changes intentionally (e.g. schema updates), fixtures should be regenerated from the live endpoint and committed.
