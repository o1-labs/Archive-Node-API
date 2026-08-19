# Versioning & Schema Stability Policy

From **1.0.0** onward the Archive Node API follows [Semantic Versioning](https://semver.org/)
and treats its **GraphQL schema**, **HTTP endpoints**, and **configuration** as the
public contract.

## What the version numbers mean

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — a backwards-incompatible change to the public contract (see
  "Breaking changes" below). Consumers may need to update queries or config.
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
- Raising the minimum supported Node.js runtime, whether through `engines`, the
  Docker base image, or the Node version used by CI to publish the package.
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
tolerates a field it doesn't know about — but not a *default response* that
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
   `"Use X. Removed in 2.0.0, no earlier than 2026-11-15."`.
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

Releases are cut from `main` by a maintainer:

```sh
npm version <major|minor|patch>   # bumps package.json + creates a git tag
git push --follow-tags            # tag push triggers the publish pipeline
```

For the initial `1.0.0` release only, `package.json` on `main` already carries
the version to release. Tag it directly (`git tag v1.0.0 && git push
--follow-tags`) rather than running `npm version`, which would bump past it.

CI then builds and publishes the npm package (with provenance, once npm trusted
publishing is configured for this repository) and the Docker images. Choose the
bump level according to the rules above.

## Migrating from npm `0.0.6`

Tags `0.0.7` through `0.0.9` existed in git but were not published to npm, so
npm consumers should treat `1.0.0` as an upgrade from `0.0.6`. Review these
operator-visible changes before rolling out:

- Browser deployments must set `CORS_ORIGIN` deliberately.
- Rate limiting is enabled and depends on the correct `TRUST_PROXY` hop count.
- The supported Node.js runtime moves to Node 22.
- Boolean environment variables reject junk values instead of relying on
  JavaScript truthiness.
- `actions` result semantics include correctness fixes called out in the release
  notes.

## Supported versions

The latest released **MAJOR.MINOR** receives bug and security fixes. Older lines
are supported on a best-effort basis.
