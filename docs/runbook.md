# Operations Runbook

How to run, observe, and troubleshoot the Archive Node API in production. Pairs
with [`docs/security.md`](./security.md) (deployment contract) and
[`deploy/`](../deploy/) (reference manifests).

> **Applies to 1.0.0 and later.** Much of what follows — `/readiness`, `/metrics`
> and the `http_*` series, `PG_STATEMENT_TIMEOUT` / `PG_MAX_CONNECTIONS`,
> `RATE_LIMIT_MAX`, and the graceful drain on SIGTERM — does not exist on `0.0.x`
> images: `/readiness` 404s, the tuning knobs are no-ops, and SIGTERM exits
> immediately without draining. **Check your running version before following any
> procedure here mid-incident**, or you'll be diagnosing against endpoints and
> settings your build doesn't have.

## Service summary

- **What it is:** a stateless, read-only GraphQL server over an archive-node
  Postgres database. It holds no state of its own; every instance is
  interchangeable and horizontally scalable.
- **The dependency that matters:** Postgres. Nearly every incident traces back to
  the database — availability, latency, or connection capacity.

## SLOs

Starting targets — tune to your traffic and DB capacity:

| Objective                                   | Target   |
| ------------------------------------------- | -------- |
| Availability (readiness over 30d)           | 99.9%    |
| Latency, p99 (typical event/action query)   | < 250 ms |
| Latency, p50                                | < 50 ms  |
| Error rate (5xx + masked unexpected errors) | < 0.1%   |

The reference 12-core / 32 GB single-box benchmark sustained ~800 req/s at p99
39 ms with API and Postgres co-located (`npm run benchmark`); real numbers depend
on query shape and DB sizing.

## What to watch

All from the Prometheus `/metrics` endpoint unless noted:

| Signal       | Metric / source                                 | Watch for                                        |
| ------------ | ----------------------------------------------- | ------------------------------------------------ |
| Request rate | `http_requests_total`                           | sudden spikes (abuse) or drops (upstream outage) |
| Error rate   | `http_requests_total{status=~"5.."}`            | sustained > SLO                                  |
| Latency      | `http_request_duration_seconds` histogram       | p99 regressions                                  |
| Saturation   | `http_requests_in_flight`                       | climbing without draining = backpressure         |
| Process      | default Node metrics (event loop lag, heap, GC) | event-loop lag, memory growth                    |
| Readiness    | `/readiness` (200/503)                          | flapping = DB connectivity issues                |
| Logs         | structured JSON, `requestId` per request        | error bursts, slow `durationMs`                  |

### Suggested alerts

- Readiness failing on > 1 replica for > 2 min (DB reachability).
- Error rate > 1% for 5 min.
- p99 latency > 1 s for 10 min.
- `http_requests_in_flight` above a high-water mark for 5 min (saturation).

## Scaling & capacity

- **Scale out** by adding replicas — they're stateless (see the HPA in
  [`deploy/kubernetes.yaml`](../deploy/kubernetes.yaml)). Rate limiting is
  per-instance, so the effective global limit ≈ replicas × `RATE_LIMIT_MAX`.
- **The real ceiling is Postgres.** A larger API fleet against one DB just moves
  the bottleneck. Note that listing replicas in `PG_CONN` does **not** spread
  reads across them — that buys failover only (see below). To add read capacity,
  put a balancer (PgBouncer, HAProxy, a managed reader endpoint) in front of
  Postgres and point `PG_CONN` at it.
- Tune `PG_MAX_CONNECTIONS` so `replicas × PG_MAX_CONNECTIONS` stays within the
  database's `max_connections` (leave headroom for other clients).

## Multi-host Postgres & failover

`PG_CONN` accepts multiple hosts (`postgres://host1:5432,host2:5432/archive`).
This is **failover, not load balancing**: every connection starts at the first
host and only moves to the next when its attempt fails, so extra hosts buy
redundancy rather than read throughput. A host dropping out is tolerated without
a restart. Validate the exact behaviour for your topology before relying on it
for HA (an automated failover test is a tracked follow-up).

Recovery semantics to expect:

- A dead host: in-flight queries on it fail (surfaced as masked errors); new
  connections route to a healthy host.
- `/readiness` returns 503 while no host is reachable, so orchestrators stop
  routing traffic until the DB recovers — without killing the (live) pods.

## Common incidents

| Symptom                                  | Likely cause                                    | Action                                                                                       |
| ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/readiness` 503, `/healthcheck` 200     | Postgres unreachable                            | check DB health/network; pods recover automatically when it returns                          |
| p99 latency climbing, `in_flight` rising | slow/expensive queries or DB CPU                | check DB load; review slow queries; confirm `PG_STATEMENT_TIMEOUT` is set                    |
| Many 429s, across unrelated clients      | `TRUST_PROXY` unset behind a gateway, so every client shares one bucket | set `TRUST_PROXY` to the gateway's hop count (`1` behind a single LB); the app logs a warning on startup when it sees `X-Forwarded-For` with `TRUST_PROXY=0` |
| Many 429s, one client                    | a client over the rate limit, or limits too low | confirm the gateway sets `X-Forwarded-For`; adjust `RATE_LIMIT_MAX`                          |
| Connection-pool exhaustion errors        | `PG_MAX_CONNECTIONS` × replicas > DB capacity   | lower pool size or raise DB `max_connections`                                                |
| Memory growth / OOM kills                | heavy result sets or a leak                     | lower `BLOCK_RANGE_SIZE`; inspect heap metrics; cap container memory                         |
| Startup exits immediately                | invalid config                                  | read the startup error — config is validated fail-fast (missing `PG_CONN`, bad `PORT`, etc.) |

## Deploys & rollback

- Rolling update; `terminationGracePeriodSeconds: 30` lets in-flight requests
  drain (the app shuts down gracefully on SIGTERM and flushes traces).
- Readiness gates traffic to new pods until they can reach the DB.
- Roll back by redeploying the previous image tag — the service is stateless and
  carries no migrations, so rollback is safe at any time.
