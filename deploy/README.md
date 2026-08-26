# Reference deployment artifacts

Opinionated starting points for running the Archive Node API in production. They
are references to adapt, not turnkey configs — review image tags, sizing, and
secret management for your environment. Read [`docs/security.md`](../docs/security.md)
first for the deployment contract (TLS gateway, read-only DB role, private
Postgres).

> **These manifests require image `>= 1.0.0`** and are pinned to it. The
> readiness probe and `/metrics` scrape target endpoints that `0.0.x` images do
> not serve — on an older image the readiness probe 404s forever, no pod goes
> Ready, and the Service ends up with no endpoints at all.

## Kubernetes — [`kubernetes.yaml`](./kubernetes.yaml)

A `Deployment` + `Service` + `HorizontalPodAutoscaler` +
`PodDisruptionBudget` with production defaults baked in. Create the Postgres
`Secret` separately so routine `kubectl apply` runs never overwrite a real
connection string with the example placeholder.

- **Liveness** probe on `/healthcheck` (process up) and **readiness** probe on
  `/readiness` (database reachable) — a node with a dead DB stops receiving
  traffic without being restarted. Readiness tolerates up to 60s of database
  slowness before removing endpoints.
- **Resource** requests/limits and a 2 to 6 replica HPA on CPU; the HPA owns the
  replica count.
- Hardened pod: non-root, `readOnlyRootFilesystem`,
  `allowPrivilegeEscalation: false`, all capabilities dropped, `RuntimeDefault`
  seccomp, no mounted service account token, and a scratch `emptyDir` mounted at
  `/tmp`.
- Prometheus scrape annotations pointing at `/metrics`, with
  `ENABLE_METRICS=true`.
- `preStop` sleeps 15s before SIGTERM, then `terminationGracePeriodSeconds: 45`
  leaves room for the app's own 10s `SHUTDOWN_TIMEOUT_MS` drain before SIGKILL.

```sh
# once, with your real connection string (never committed):
kubectl create secret generic archive-node-api \
  --from-literal=PG_CONN='postgres://archive_api_ro:...@postgres:5432/archive'

kubectl apply -f deploy/kubernetes.yaml
```

Put a TLS-terminating Ingress/gateway in front and set **`TRUST_PROXY` to the
number of hops** it adds. The gateway must set `X-Forwarded-For`, but the API
ignores that header while `TRUST_PROXY=0` (the safe default for a directly
exposed server), so leaving it unset behind an ingress collapses every client
into a single rate-limit bucket. See [`docs/security.md`](../docs/security.md).

## Docker Compose — [`docker-compose.prod.yml`](./docker-compose.prod.yml)

Runs only the published image against an external Postgres (contrast with the
repo-root `docker-compose.yml`, which is for local dev with a bundled DB).
Compose surfaces the image's `/healthcheck` as container health for images
`>= 1.0.0`; this is a liveness check, not database-aware readiness.

```sh
PG_CONN='postgres://archive_api_ro:...@db:5432/archive' \
  docker compose -f deploy/docker-compose.prod.yml up -d
```

## Sizing

The bottleneck is Postgres, not this server. Note that listing several hosts in
`PG_CONN` gives you **failover, not read throughput** — the client sticks to the
first host and only moves on when the connection fails. To spread reads across
replicas, put a load balancer (PgBouncer, HAProxy, a managed reader endpoint) in
front of Postgres and point `PG_CONN` at it. See the benchmark note in the root
[`README.md`](../README.md#hardware-requirements) and use `npm run benchmark` to
size your own deployment.
