# Reference deployment artifacts

Opinionated starting points for running the Archive Node API in production. They
are references to adapt, not turnkey configs — review image tags, sizing, and
secret management for your environment. Read [`docs/security.md`](../docs/security.md)
first for the deployment contract (TLS gateway, read-only DB role, private
Postgres).

## Kubernetes — [`kubernetes.yaml`](./kubernetes.yaml)

A `Deployment` + `Service` + `HorizontalPodAutoscaler` (and a placeholder
`Secret`) with the production defaults baked in:

- **Liveness** probe on `/healthcheck` (process up) and **readiness** probe on
  `/readiness` (database reachable) — a node with a dead DB stops receiving
  traffic without being restarted.
- **Resource** requests/limits and a 2→6 replica HPA on CPU.
- Hardened pod: non-root, `readOnlyRootFilesystem`, `allowPrivilegeEscalation:
false`, all capabilities dropped, `RuntimeDefault` seccomp.
- Prometheus scrape annotations pointing at `/metrics`.
- `terminationGracePeriodSeconds: 30` to match the app's graceful-shutdown drain.

```sh
# edit the Secret's PG_CONN (use a read-only role) and the image tag first
kubectl apply -f deploy/kubernetes.yaml
```

Put a TLS-terminating Ingress/gateway in front (it must set `X-Forwarded-For`
for per-client rate limiting) — see [`docs/security.md`](../docs/security.md).

## Docker Compose — [`docker-compose.prod.yml`](./docker-compose.prod.yml)

Runs only the published image against an external Postgres (contrast with the
repo-root `docker-compose.yml`, which is for local dev with a bundled DB).

```sh
PG_CONN='postgres://archive_api_ro:...@db:5432/archive' \
  docker compose -f deploy/docker-compose.prod.yml up -d
```

## Sizing

The bottleneck is Postgres, not this server; point `PG_CONN` at read replicas for
throughput. See the benchmark note in the root [`README.md`](../README.md#hardware-requirements)
and use `npm run benchmark` to size your own deployment.
