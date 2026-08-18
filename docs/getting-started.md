# Archive Node API — Setup Guide

The Archive Node API is a GraphQL server that exposes Mina archive-node data
(blocks, events, actions, transactions) for o1js / zkApp developers. It does
not run an archive node itself — it queries an existing archive-node Postgres
database.

This guide covers three ways to get it running locally:

- **[Path A: npm](#path-a--npm-bring-your-own-database)** — install from npm and point at a Postgres you already have. Lightest weight.
- **[Path B: Prebuilt Docker image](#path-b--prebuilt-docker-image-bring-your-own-database)** — pull the published image and point it at your Postgres. No Node toolchain needed.
- **[Path C: Docker Compose with snapshot](#path-c--docker-compose-with-database-snapshot)** — no archive node? Download a mainnet/devnet snapshot and let Compose stand up Postgres + the API for you.

Skip to the path that matches your situation. The [Configuration](#configuration) and [Verification](#verification) sections apply to all three.

---

## Prerequisites

- **Path A:** Node.js 20+ (`node --version`) and a reachable archive-node Postgres database
- **Path B:** Docker, and a reachable archive-node Postgres database
- **Path C:** Docker + Docker Compose, ~50 GB free disk for the snapshot

If you don't already have an archive node running and just want to develop against real chain data, Path C is the fastest way to get there.

---

## Path A — npm (bring your own database)

Use this when you already have an archive-node Postgres reachable (for example: a `mina-lightnet` instance, a managed archive node, or your own deployment).

### 1. Install

Pick one:

```sh
# Option 1: global install — gives you a `mina-archive-node-graphql` binary
npm install -g @o1-labs/mina-archive-node-graphql

# Option 2: one-shot, no install
npx @o1-labs/mina-archive-node-graphql
```

### 2. Run

```sh
export PG_CONN='postgresql://postgres:postgres@localhost:5432/archive'
export ENABLE_GRAPHIQL=true        # optional, exposes GraphiQL UI at /
mina-archive-node-graphql
# → Server is running on port: 8080
```

Or via a `.env` file (Node 20+ supports `--env-file` natively):

```sh
cat > .env <<'EOF'
PG_CONN=postgresql://postgres:postgres@localhost:5432/archive
PORT=8080
ENABLE_GRAPHIQL=true
EOF
node --env-file=.env "$(which mina-archive-node-graphql)"
```

Skip to [Verification](#verification).

---

## Path B — Prebuilt Docker image (bring your own database)

Use this when you already have an archive-node Postgres reachable but don't want to install Node locally. The image is published to GitHub Container Registry on each release.

### 1. Pull the image

```sh
# latest stable release
docker pull ghcr.io/o1-labs/archive-node-api:latest

# or pin a specific version (recommended for production)
docker pull ghcr.io/o1-labs/archive-node-api:0.0.6
```

### 2. Run

Pass `PG_CONN` (and any other [config](#configuration)) as environment variables, and publish port `8080`:

```sh
docker run --rm \
  -p 8080:8080 \
  -e PG_CONN='postgresql://postgres:postgres@host.docker.internal:5432/archive' \
  -e ENABLE_GRAPHIQL=true \
  ghcr.io/o1-labs/archive-node-api:latest
# → Server is running on port: 8080
```

Notes:

- On Linux, `host.docker.internal` may not resolve. Either run with `--network host` and use `localhost` in `PG_CONN`, or pass the host's LAN IP.
- For a reusable setup, put the variables in a file and use `--env-file`:

  ```sh
  docker run --rm -p 8080:8080 --env-file ./archive-api.env ghcr.io/o1-labs/archive-node-api:latest
  ```

Skip to [Verification](#verification).

---

## Path C — Docker Compose with database snapshot

Use this when you don't have an archive-node Postgres available. Compose starts Postgres seeded from a downloaded mainnet/devnet snapshot, plus the API and Jaeger, in one command.

### 1. Clone the repo

```sh
git clone https://github.com/o1-labs/Archive-Node-API
cd Archive-Node-API
```

The snapshot flow needs the `docker-compose.yml`, the snapshot download script, and the seed scripts that ship in the repo — installing from npm is not enough here.

### 2. Set up environment

```sh
cp .env.example.compose .env
```

The defaults work out of the box for local use. Edit `.env` if you want a different Postgres password, a different port, etc.

### 3. Download the snapshot

```sh
./scripts/download_db.sh           # mainnet by default
# ./scripts/download_db.sh devnet  # for devnet
```

The dump lands in `./data/archive.sql`. Expect a multi-GB download.

### 4. Start the stack

```sh
docker compose up
```

Compose will:

- start Postgres and load the snapshot (this takes a while on first run)
- start Jaeger for tracing
- build and start the API on port `8080`

Once you see `Server is running on port: 8080` in the logs, you're up.

### Variant: only Postgres + Jaeger (use when iterating on the API itself)

If you're modifying the API code and want to run it via `npm run start` against the Compose-managed Postgres:

```sh
docker compose up postgres jaeger
# in another terminal:
npm i && npm run start
```

Make sure your `.env`'s `PG_CONN` points at `localhost`, not the in-network hostname:

```dotenv
PG_CONN=postgres://postgres:password@localhost:5432/archive
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

---

## Configuration

The server reads config from environment variables. `PG_CONN` is the only required one.

| Variable | Default | Description |
| --- | --- | --- |
| `PG_CONN` | *(required)* | Postgres connection string for the archive-node DB |
| `PORT` | `8080` | Port the GraphQL server listens on |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `CORS_ORIGIN` | `*` | CORS allowed origin |
| `READINESS_PING_TIMEOUT_MS` | `2000` | Upper bound on the `/readiness` database ping. Exceeding it returns 503 rather than leaving the probe to hang. Keep it below the orchestrator's probe `timeoutSeconds` |
| `ENABLE_GRAPHIQL` | `false` | If `true`, serves the GraphiQL playground at `/` |
| `ENABLE_INTROSPECTION` | `false` | If `true`, allows GraphQL schema introspection |
| `ENABLE_LOGGING` | `false` | Enable request logging |
| `ENABLE_METRICS` | `false` | If `true`, exposes unauthenticated Prometheus metrics at `/metrics` |
| `BLOCK_RANGE_SIZE` | `10000` | Max block range a single query may span |
| `ENABLE_BLOCK_TRANSACTION_DETAILS` | `false` | Include `userCommands` / `zkappCommands` / `feeTransfers` |
| `ENABLE_JAEGER` | `false` | Emit traces to a Jaeger collector |
| `JAEGER_SERVICE_NAME` | `archive-api` | Service name reported to Jaeger |
| `JAEGER_ENDPOINT` | — | e.g. `http://localhost:14268/api/traces` |

### Notes on `PG_CONN`

- Standard Postgres connection-string format: `postgres://user:pass@host:port/dbname`
- For HA, pass multiple hosts: `postgres://host1:5432,host2:5432/archive` (same syntax as `psql`).

---

## Verification

Once the server prints `Server is running on port: 8080`:

```sh
# liveness probe — process is up (does not check the DB)
curl -fsS http://localhost:8080/healthcheck && echo

# readiness probe — returns 200 only when Postgres is reachable, else 503
curl -fsS http://localhost:8080/readiness && echo

# sanity GraphQL query
curl -fsS http://localhost:8080/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}'
```

Use `/healthcheck` as the Kubernetes **liveness** probe and `/readiness` as the **readiness** probe: a node whose database is unreachable reports not-ready (so it stops receiving traffic) while staying live (so it isn't needlessly restarted).

Suggested probe settings — readiness should tolerate a brief database blip because every replica usually shares one Postgres:

```yaml
livenessProbe:
  httpGet: { path: /healthcheck, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /readiness, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3 # > READINESS_PING_TIMEOUT_MS
  failureThreshold: 3
  successThreshold: 1
```

If you set `ENABLE_GRAPHIQL=true`, open <http://localhost:8080/> in a browser for the in-page query explorer.

### Metrics

Set `ENABLE_METRICS=true` to expose Prometheus metrics at `/metrics` — RED metrics (`http_requests_total`, `http_request_duration_seconds`, `http_requests_in_flight`) plus standard Node process metrics.

`/metrics` shares the API port and is unauthenticated. Restrict it to your Prometheus scrapers at the ingress or load balancer.

```sh
curl -fsS http://localhost:8080/metrics | head
```

### Confirm the DB is wired up

This query returns the latest indexed block height — compare it with [MinaScan](https://minascan.io/mainnet/home) to confirm you're looking at the network you think you are:

```graphql
{
  networkState {
    maxBlockHeight {
      canonicalMaxBlockHeight
      pendingMaxBlockHeight
    }
  }
}
```

### Sample event/action query

```graphql
query GetEvents {
  events(input: { address: "B62..." }) {
    blockInfo { height stateHash timestamp chainStatus }
    eventData { data }
    transactionInfo { status hash memo }
  }
}
```

Replace `B62...` with the address of the zkApp whose events you want.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `An error occurred: AggregateError [ECONNREFUSED]` | `PG_CONN` host/port wrong or DB not running | Verify with `psql "$PG_CONN" -c 'SELECT 1'` |
| `relation "..." does not exist` on startup | Postgres reachable but not an archive-node schema | Point `PG_CONN` at an actual archive-node DB |
| `/` returns 404 in the browser | `ENABLE_GRAPHIQL` not set | Set `ENABLE_GRAPHIQL=true` and restart |
| `EADDRINUSE: address already in use :::8080` | Port already taken | `PORT=<free port>` and restart |
| Compose: API starts but logs `relation ... does not exist` | Snapshot still loading into Postgres on first run | Wait for the `postgres` container to finish initialising |
| Compose: snapshot download script fails | Network or storage limit | Re-run `./scripts/download_db.sh`; check disk space |

---

## Where to go next

- [Schema reference](../schema.graphql) — the full GraphQL surface
- [Mina archive node docs](https://docs.minaprotocol.com/node-operators/archive-node) — what an archive node is and how to run one
- [`AGENTS.md`](../AGENTS.md) — orientation for AI coding agents working in this repo
