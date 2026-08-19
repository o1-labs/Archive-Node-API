# Mina Archive Node GraphQL API

[![Unit Tests](https://github.com/o1-labs/Archive-Node-API/actions/workflows/unit-tests.yaml/badge.svg)](https://github.com/o1-labs/Archive-Node-API/actions/workflows/unit-tests.yaml)
[![codecov](https://codecov.io/gh/o1-labs/Archive-Node-API/branch/main/graph/badge.svg)](https://codecov.io/gh/o1-labs/Archive-Node-API)
[![npm](https://img.shields.io/npm/v/@o1-labs/mina-archive-node-graphql.svg)](https://www.npmjs.com/package/@o1-labs/mina-archive-node-graphql)

A GraphQL server that exposes [Mina archive-node](https://docs.minaprotocol.com/node-operators/archive-node) data — blocks, events, actions, transactions — for o1js / zkApp developers. It does **not** run an archive node itself; it queries an existing archive-node Postgres database.

```graphql
query {
  events(input: { address: "B62..." }) {
    blockInfo { height stateHash timestamp chainStatus }
    eventData { data }
    transactionInfo { status hash memo }
  }
}
```

The full surface lives in [`schema.graphql`](./schema.graphql).

## Quick start

Pick the path that matches your situation. Each one is fully covered in [`docs/getting-started.md`](./docs/getting-started.md).

| Path | When to use it |
| --- | --- |
| **[npm](./docs/getting-started.md#path-a--npm-bring-your-own-database)** | You already have an archive-node Postgres reachable. Lightest weight. |
| **[Prebuilt Docker image](./docs/getting-started.md#path-b--prebuilt-docker-image-bring-your-own-database)** | You have a Postgres reachable but don't want a Node toolchain locally. |
| **[Docker Compose + DB snapshot](./docs/getting-started.md#path-c--docker-compose-with-database-snapshot)** | No archive-node DB available — Compose stands one up from a snapshot. |

```sh
# the 30-second taste (Path A)
npm install -g @o1-labs/mina-archive-node-graphql
PG_CONN='postgres://postgres:postgres@localhost:5432/archive' \
  ENABLE_GRAPHIQL=true \
  mina-archive-node-graphql
# → http://localhost:8080
```

## Configuration

`PG_CONN` is the only required environment variable. The most common knobs:

| Variable | Default | Description |
| --- | --- | --- |
| `PG_CONN` | *(required)* | Postgres connection string for the archive-node DB |
| `PORT` | `8080` | Port the GraphQL server listens on |
| `ENABLE_GRAPHIQL` | `false` | Serve the GraphiQL playground at `/` |
| `ENABLE_INTROSPECTION` | `false` | Allow GraphQL schema introspection |
| `ENABLE_LOGGING` | `false` | Enable request logging |
| `ENABLE_METRICS` | `false` | Expose Prometheus metrics at `/metrics` |
| `ENABLE_JAEGER` | `false` | Emit traces to a Jaeger collector |
| `JAEGER_ENDPOINT` | — | e.g. `http://localhost:14268/api/traces` |

Full reference, including HA / multi-host `PG_CONN` syntax, in [`docs/getting-started.md#configuration`](./docs/getting-started.md#configuration).

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the server with hot reload (reads `.env`) |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run start` | Run the compiled server |
| `npm run lint` | ESLint over `*.ts` |
| `npm run test:unit` | Unit tests (no DB required) |
| `npm run test` | Full test suite — needs a running [Lightnet](https://docs.minaprotocol.com/zkapps/testing-zkapps-lightnet) |
| `npm run codegen` | Regenerate `src/resolvers-types.ts` from `schema.graphql` |
| `npm run benchmark` | Artillery load test against a running server |

Running the full suite requires Lightnet plus a populated DB:

```sh
node --loader ts-node/esm benchmark/setup.ts   # deploys a zkApp and emits events/actions
npm run test
```

## Releasing

Tagged commits trigger CI to publish:

- npm (public): [`@o1-labs/mina-archive-node-graphql`](https://www.npmjs.com/package/@o1-labs/mina-archive-node-graphql)
- Docker (GHCR): `ghcr.io/o1-labs/archive-node-api`

To cut a release:

```sh
npm version <major|minor|patch>
git push --follow-tags
```

CI builds, publishes the npm package with provenance, and pushes Docker tags `1.2.3`, `1.2`, `1`, `latest`.

From 1.0.0 the GraphQL schema, HTTP endpoints, and configuration are a versioned public contract — see the [versioning & schema stability policy](./docs/versioning.md) for what counts as a breaking change and how deprecations work.

## Hardware requirements

The bottleneck is the Postgres database, not this server. Listing multiple hosts
in `PG_CONN` gives failover, not read fan-out; put a load balancer or managed
reader endpoint in front of read replicas when you need to spread query load. A
recent benchmark on a 12-core / 32 GB box (API + Postgres co-located) sustained
~800 req/s with p99 latency of 39 ms. Use `npm run benchmark` to size your own
deployment.

For SLOs, capacity guidance, what to monitor, and incident response, see the [operations runbook](./docs/runbook.md).

## Contributing

- AI coding agents: read [`AGENTS.md`](./AGENTS.md) first.
- Issues and PRs: [github.com/o1-labs/Archive-Node-API](https://github.com/o1-labs/Archive-Node-API)

## License

ISC
