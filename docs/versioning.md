# Versioning & Schema Stability Policy

From **1.0.0** onward the Archive Node API follows [Semantic Versioning](https://semver.org/)
and treats its **GraphQL schema**, **HTTP endpoints**, and **configuration** as the
public contract.

## What the version numbers mean

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — a backwards-incompatible change to the public contract (see
  "Breaking changes" below), or an alignment major shared with the client SDKs
  (see "One major across the server and the SDKs"). Release notes say which;
  an alignment major needs no consumer action.
- **MINOR** — backwards-compatible additions: new schema fields/types/arguments,
  new optional config, new endpoints. Existing queries keep working.
- **PATCH** — backwards-compatible bug fixes and internal changes.

## What counts as a breaking change

GraphQL schema:

- Removing or renaming a type, field, enum value, or argument.
- Changing a field's type.
- **Output fields:** making a non-null field nullable (`String!` → `String`).
  Clients written against the guarantee may now receive `null` where they
  cannot handle it. The reverse — `String` → `String!` — only strengthens the
  guarantee and is safe.
- **Arguments and input fields:** making a nullable argument non-null
  (`String` → `String!`), which rejects callers that were legitimately omitting
  it. Here the reverse is the safe direction — the mirror image of output
  fields, because the client is the one supplying the value.
- Adding a required (non-null, no-default) argument to an existing field.

Operational contract:

- Removing or renaming an environment variable, or changing its default in a way
  that alters behaviour.
- Removing or renaming an HTTP endpoint (`/`, `/healthcheck`, `/readiness`,
  `/metrics`).
- Raising the minimum supported Node.js runtime for npm consumers, through
  `engines` or the Node version used by CI to publish the package.
- Moving the container image to a Node line that is not LTS (Current or
  end-of-life). Moving it between LTS lines, with `engines` and the image's
  HTTP contract (port, endpoints, environment variables, entrypoint, user)
  unchanged, is **minor**.
- Enabling by default behaviour that can reject, throttle, or block a request
  that was previously accepted, such as rate limiting, request-size caps,
  query-cost limits, or a stricter CORS allowlist.

Additive counterparts of the above (new optional field, new nullable argument,
new env var with a safe default) are **minor**, not breaking.

## Flag-gating behaviour changes

Changes that alter **default response shape or content**, or the **set of exposed
queries**, ship **disabled by default behind an environment flag** — the practice
this repo already follows with `ENABLE_BLOCK_TRANSACTION_DETAILS` (gates
block-detail output) and `ENABLED_QUERIES` (allowlists the exposed query
surface).

- A flagged, default-off change is **minor**.
- Flipping such a default on — or removing the flag so the new behaviour is
  unconditional — changes what existing clients receive out of the box, and is
  **major**.

Correcting a result that was demonstrably wrong is a bug fix, not a flagged
behaviour change. Call the fix out explicitly in the release notes with the
before/after shape so consumers know why content changed.

This is what lets consumers survive upgrades. The
[mina-explorer](https://github.com/o1-labs/mina-explorer) fires fallback query
chains and degrades on the exact `"Cannot query field"` validation error, so it
tolerates a field it doesn't know about — but not a _default response_ that
quietly changes shape. An unflagged change there doesn't error; it blanks
Explorer pages while every health check stays green. That failure mode is why
this is a rule rather than a convention: the schema checker cannot catch it,
because nothing about the schema is technically breaking.

## Error messages and validation behaviour

GraphQL validation and parse errors are part of the public contract. Clients use
them for capability detection: they probe for a field or filter and fall back
based on the error text.

Covered by this policy:

- Validation and parse errors must be returned in `errors[]` with their verbatim
  `graphql-js` wording, including `Cannot query field "X" on type "Y".`,
  `Unknown argument "X" on field "Y".`, `Unknown type "X".`, and unknown
  input-field errors that name the field, such as `inBestChain`.
- `errors[]` must still be present in the response body when the HTTP status is
  non-2xx; clients parse the body regardless of status code.
- Error masking applies to unexpected thrown runtime errors only. Widening it to
  cover validation or parse errors, or replacing their text with a generic
  string, error code, or redacted message, is **major**.

Known consumers match this text today:
[mina-explorer](https://github.com/o1-labs/mina-explorer) checks for
`inBestChain`, while mina-explorer-api checks for `Cannot query field`,
`Unknown argument`, `Unknown type`, and `inBestChain`. As with flag-gating,
breaking this does not fail loudly: the schema checker stays green, health
checks stay green, and consumers may serve empty views.

## Deprecation policy

We prefer deprecation over removal:

1. Mark schema elements with the `@deprecated(reason: "…")` directive, pointing to
   the replacement and planned removal target, for example
   `"Use X. Removed in 3.0.0, no earlier than 2027-03-01."`.
2. Announce the deprecation in the GitHub release notes for the minor that
   introduces it. The 90-day clock starts when that release is published.
3. Keep the deprecated element working for **at least one minor release and 90
   days**, whichever is later, before removing it in a subsequent **major**.

Environment variables follow the same path: continue honouring the old name
(with a startup warning) for one minor + 90 days before removal.

## Enforcement

Schema changes are checked in CI by **graphql-inspector** (the "Check Schema"
job). A change it flags as breaking fails the build unless the PR carries the
`expected-breaking-change` label — so every breaking change is a deliberate,
reviewed decision that must be paired with a major version bump.

## Releasing

Releases are cut in two steps:

1. A release PR bumps `package.json`/`package-lock.json` (and
   `src/schema-version.ts` if the schema moved) and merges to `main`.
2. A maintainer tags that merge commit; the tag push triggers the publish
   pipeline:

   ```sh
   git tag v$(node -p "require('./package.json').version") <merge-sha>
   git push origin v<version>
   ```

Do not run `npm version` on `main`: `package.json` already carries the version
being released, and `npm version` would bump past it.

CI then builds and publishes the npm package (with provenance, once npm trusted
publishing is configured for this repository) and the Docker images. Choose the
bump level according to the rules above.

### CI credentials

`.github/workflows/build.yaml` authenticates to Google Cloud **keylessly**, via
Workload Identity Federation. There is no service-account key stored in this
repository and none should ever be added.

|                 |                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Provider        | `projects/1020762690228/locations/global/workloadIdentityPools/github-actions/providers/github`                                       |
| Service account | `archive-node-api-ci@o1labs-192920.iam.gserviceaccount.com`                                                                           |
| Declared in     | [`gitops-infrastructure`](https://github.com/o1-labs/gitops-infrastructure) → `platform/gcloud/service-accounts/workload-identity.tf` |

Each run presents GitHub's OIDC token (`permissions: id-token: write`) and
receives a 15-minute Google access token, honoured only for this repository. The
token is minted after `npm ci` / `npm run build` have finished, is never written
to the workspace (`create_credentials_file: false`), and reaches only the two
registry logins and `npm publish`. Changing the step order, or reintroducing a
stored credential, undoes both properties — see the ordering comment at the top
of the job.

## Upgrading to 2.0.0

npm never received 1.0.x (only `0.0.6` is published), so npm consumers go
straight from `0.0.6` to `2.0.0`: apply both lists below. Container users on
1.0.0 need only the second.

### From `0.0.6` (changes that shipped in git tag 1.0.0)

- Browser deployments must set `CORS_ORIGIN` deliberately.
- Rate limiting is enabled and depends on the correct `TRUST_PROXY` hop count.
- The supported Node.js runtime moves to Node 22.12 (`engines`).
- Boolean environment variables reject junk values instead of relying on
  JavaScript truthiness.
- `actions` result semantics include correctness fixes called out in the release
  notes.

### From 1.0.0

2.0.0 is an alignment major (see "One major across the server and the SDKs"):
no query that worked against 1.0.0 changes its result shape. Review:

- The container image runs Node 24 (LTS) and is published for linux/amd64 and
  linux/arm64. `engines` is unchanged (`>=22.12.0`).
- License: Apache-2.0 (was ISC).
- New query `schemaVersion`, always served, even when `ENABLED_QUERIES`
  restricts the data queries. Listing it in `ENABLED_QUERIES` is accepted.
- New query `zkappCommands`, off unless `ENABLE_ZKAPP_COMMANDS_QUERY=true`;
  bounded by `ZKAPP_COMMAND_RANGE_SIZE` (1000) and
  `ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT` (5000).
- `ENABLED_QUERIES` now accepts `verificationKeyUpdates` (1.0.0 failed startup
  on it) and `zkappCommands`.
- Eight list positions declare non-null elements (`[T]` → `[T!]`). Responses
  are unchanged; codegen'd clients see stricter element types.

## Schema version

`schema.graphql` carries its own `MAJOR.MINOR` version, served by the
`schemaVersion` query and defined in `src/schema-version.ts`. It is **not** the
package version.

```graphql
{
  schemaVersion
}
```

The server answers `"2.0"` today. Schema 2.0 has no breaking change against
schema 1.0, which the 1.0.x releases shipped; see "One major across the server
and the SDKs" below for why it is a major. Its changes against 1.0:

- the `schemaVersion` query itself;
- the `zkappCommands` query and its types, off by default
  (`ENABLE_ZKAPP_COMMANDS_QUERY`) but part of the contract;
- non-null elements on eight list positions that never carried a null
  (`[T]` → `[T!]`), which only strengthens the guarantee.

- The **package** version describes this server: its flags, its defaults, its
  behaviour. The list of breaking changes above is about that.
- The **schema** version describes only what a client codes against: the types,
  fields and arguments in `schema.graphql`. Its MINOR moves on an additive
  change, its MAJOR on one that can break a client or on an alignment major
  shared with the SDKs.

Their MINOR and PATCH move independently, and that is deliberate; the MAJOR is
shared (see "One major across the server and the SDKs"). A server release can
change a default or a flag without touching the contract, and a schema can gain
a field without the server's own surface changing.

The client SDKs pin the schema version they were built against and compare it
with what `schemaVersion` reports.

### One major across the server and the SDKs

This package, its schema, and the three client SDKs
([JS](https://github.com/o1-labs/mina-archive-sdk-js),
[Go](https://github.com/o1-labs/mina-archive-sdk-go),
[Rust](https://github.com/o1-labs/mina-archive-sdk-rust)) share one MAJOR.
**Same major means compatible.** A higher server minor only adds what the SDK
does not know about yet.

When any of them takes a major, all of them do, even those with no breaking
change of their own. Semver allows a major without a break; it forbids only a
break without a major. Minors and patches stay independent.

2.0.0 is the first such release: the SDKs needed a major for changes to their
own API, and this server and its schema took one to match. A 1.0.x client
keeps working against it.

Mina versions are separate — see below.

`schemaVersion` is served even when `ENABLED_QUERIES` restricts the data
queries. A compatibility check a deployment can switch off would leave clients
guessing, which is the situation the field exists to end.

`schemaVersion` describes the contract, not which queries a deployment exposes.
`ENABLED_QUERIES` and `ENABLE_ZKAPP_COMMANDS_QUERY` can still remove data
queries from a given server, so a client must continue to detect features from
the `Cannot query field` error, as mina-explorer already does.

## Mina compatibility

This server reads a Mina archive node's PostgreSQL database directly, so what it
depends on is the **archive database schema**, which comes from Mina. Its own
GraphQL contract sits on top of that and moves separately.

**Nightly check of the deployed endpoints.** The `Live Integration` workflow
(`.github/workflows/live-integration.yaml`, 05:00 UTC) runs the live-api suite
against the archive endpoint set in each `*_ARCHIVE_API_URL` repository
variable. It tests the build that runs at that endpoint, not the commit that
triggers the workflow. A network with no variable is skipped. As of 2026-10-02
no `*_ARCHIVE_API_URL` variable is set, so every leg skips and the nightly run
gives no compatibility evidence until the variables are configured.

**Known-good as of 2026-09-22**, read from the live daemons rather than assumed:

| Network | Daemon commit  | Mina release                                                                                 |
| ------- | -------------- | -------------------------------------------------------------------------------------------- |
| mainnet | `685030107ff3` | [`4.0.0-mainnet-mesa`](https://github.com/MinaProtocol/mina/releases/tag/4.0.0-mainnet-mesa) |
| devnet  | `6965b502ecd7` | [`4.0.0-devnet-mesa`](https://github.com/MinaProtocol/mina/releases/tag/4.0.0-devnet-mesa)   |

**Untested, not unsupported.** Mina releases before 4.0.0 are not exercised by
any job here. The integration fixture
(`tests/integration/fixtures/archive_db.sql`) is a `pg_dump` of an archive
database and declares no Mina release, so it is not evidence either way. If you
run an older archive node, treat compatibility as unknown until you have run the
queries you need against it.

A hardfork that changes the archive database schema is the case to watch: it can
break the SQL in `src/db/sql/` without changing one line of this repository.

## Supported versions

The latest released **MAJOR.MINOR** receives bug and security fixes. Older lines
are supported on a best-effort basis.
