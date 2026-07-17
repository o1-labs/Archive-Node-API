# Security & Deployment Hardening

This document describes the intended security posture of the Archive Node API
and how to deploy it safely on a public network. It complements the
[setup guide](./getting-started.md); read that first for installation and the
full [configuration reference](./getting-started.md#configuration).

## Security model

The Archive Node API is a **public, read-only** GraphQL service over an existing
archive-node Postgres database. It exposes already-public on-chain data (blocks,
events, actions, transactions) and **never writes** to the database or the chain.

Consequences of that model:

- **No application-level authentication.** The API is meant to be openly
  queryable, the same way a block explorer's read API is. Access control, if you
  need it, is enforced at the gateway in front of the service (see below) — not
  in the app.
- **The data is not secret; availability is the asset to protect.** The main
  threat is abuse that degrades the service or the backing Postgres for everyone.
  The hardening below is aimed at that.

> If you require per-caller authentication or quotas, terminate it at the
> gateway (API keys, JWT, or mTLS). The application is intentionally kept simple
> and unauthenticated; gating is an operator concern.

## Network architecture

Run the API behind a **TLS-terminating reverse proxy or load balancer**. The
application itself speaks plain HTTP on `PORT` and does not terminate TLS.

```
            ┌─────────────────────────┐
 client ───▶│  TLS gateway / LB        │  (HTTPS, X-Forwarded-For,
 (HTTPS)    │  nginx / Envoy / ALB     │   request-size limits, optional auth)
            └────────────┬────────────┘
                         │  HTTP (private network)
            ┌────────────▼────────────┐
            │  Archive Node API        │  (this service, :8080)
            └────────────┬────────────┘
                         │  TCP (private network)
            ┌────────────▼────────────┐
            │  Postgres (archive DB)   │  read replicas, not publicly reachable
            └─────────────────────────┘
```

Requirements:

- **Set `X-Forwarded-For` and `TRUST_PROXY` together.** A gateway should append
  `X-Forwarded-For`, and the API derives the rate-limit client from that header
  only as far as `TRUST_PROXY` allows: it names how many proxy hops sit in front
  of the API, and the client is read that many entries from the *right* of the
  header — the part your own proxies appended. `TRUST_PROXY` has no default;
  while it is unset, rate limiting is disabled with a startup warning. Use
  `TRUST_PROXY=0` only for a directly exposed server. Behind a gateway, set the
  real hop count for that topology (a GCP external Application Load Balancer
  commonly needs `2`). Too low collapses clients onto a proxy address; too high
  can trust caller-prepended entries.
- **Keep Postgres private.** The database must not be reachable from the public
  internet — only from the API instances.

## Built-in protections

The service ships with abuse controls that are safe by default and tunable via
the [configuration](./getting-started.md#configuration):

| Protection | Default | Purpose |
| --- | --- | --- |
| Per-IP **rate limiting** | on once `TRUST_PROXY` is set | Bounds request volume per client; disabled with a startup warning while `TRUST_PROXY` is unset |
| GraphQL **query-cost limits** (depth / aliases / tokens / cost) | on | Rejects expensive/abusive query shapes before execution |
| Postgres **statement timeout** & pool limits | on | Caps how long/much a single query can consume |
| **CORS** | same-origin only | Cross-origin browser access is opt-in — see the caveat below before locking it down |
| **Introspection** | off | Schema introspection disabled unless explicitly enabled |
| Field-suggestion blocking | on | Error messages don't leak schema shape |

> **These controls arrive in 1.0.0.** On `0.0.x` releases they are absent or
> default-open — notably `CORS_ORIGIN` defaults to `*` there, so cross-origin
> access is wide open rather than opt-in. Check your running version before
> relying on any row above.

Tune these to your traffic; see the configuration table for the exact
environment variables and defaults.

### CORS and browser clients

Cross-origin browser clients **cannot reach this API unless their web origin is
allowlisted in `CORS_ORIGIN`** — and when they fail, they fail silently from the
server's point of view: the browser blocks the response and the server logs stay
clean. This catches people out, so decide deliberately:

- **A genuinely public read API** that any browser may call — including the
  [mina-explorer](https://github.com/o1-labs/mina-explorer) and third-party
  dashboards — wants `CORS_ORIGIN=*`. That is the correct setting here, not a
  lapse in hardening: the data is already public, and CORS is not an access
  control (it constrains browsers, not `curl` or a server-side client).
- **A deployment with a known, fixed set of front-ends** wants those origins
  listed explicitly. This only limits which *browser pages* may read responses;
  it does not restrict anyone else.

## Least-privilege database access

The API only ever issues `SELECT`s. Give it a **read-only** Postgres role rather
than a superuser or the archive ingest user:

```sql
-- one-time setup on the archive database
CREATE ROLE archive_api_ro LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE archive TO archive_api_ro;
GRANT USAGE ON SCHEMA public TO archive_api_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO archive_api_ro;
-- so the role can also read tables added by future archive migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO archive_api_ro;
```

Then point `PG_CONN` at `archive_api_ro`. Even in the event of a query-layer bug,
the credentials cannot modify or delete data.

## Operational practices

- **Secrets:** pass `PG_CONN` (and any gateway secrets) via environment / a
  secret manager, never bake them into the image. Prefer SSL to Postgres
  (`?sslmode=require`) when the DB is on a managed provider.
- **Keep `ENABLE_GRAPHIQL` / `ENABLE_INTROSPECTION` off in production** unless you
  intentionally want a public playground.
- **Updates:** track and apply dependency and base-image security updates
  (supply-chain scanning is part of the [production-readiness work](https://github.com/o1-labs/Archive-Node-API/issues/163)).

## Deployment checklist

- [ ] TLS terminated at a gateway; plain-HTTP app port not publicly exposed
- [ ] `TRUST_PROXY` explicitly set: `0` only for direct exposure, or the real
  hop count behind a gateway; rate limiting is disabled until this is set
- [ ] Gateway sets `X-Forwarded-For`
- [ ] Postgres reachable only from the API, not the public internet
- [ ] API uses a **read-only** Postgres role
- [ ] Rate-limit and query-cost limits reviewed for your expected traffic
- [ ] `CORS_ORIGIN` matches your clients: `*` for a public API any browser may
      call, or an explicit allowlist if your front-ends are known and fixed —
      leaving it unset blocks all cross-origin browser clients
- [ ] `ENABLE_GRAPHIQL` and `ENABLE_INTROSPECTION` off (unless intentionally public)
- [ ] Secrets injected via env / secret manager; SSL to Postgres where applicable

## Scope

This document covers deploying *this service* securely. It does not cover
securing the upstream Mina archive node or its Postgres ingest pipeline. Broader
production-readiness work (observability, readiness probes, supply-chain
scanning, runbooks) is tracked in the
[production-readiness epic](https://github.com/o1-labs/Archive-Node-API/issues/163).
