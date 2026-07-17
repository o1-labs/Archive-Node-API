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

This is what lets consumers survive upgrades. The
[mina-explorer](https://github.com/o1-labs/mina-explorer) fires fallback query
chains and degrades on the exact `"Cannot query field"` validation error, so it
tolerates a field it doesn't know about — but not a *default response* that
quietly changes shape. An unflagged change there doesn't error; it blanks
Explorer pages while every health check stays green. That failure mode is why
this is a rule rather than a convention: the schema checker cannot catch it,
because nothing about the schema is technically breaking.

## Deprecation policy

We prefer deprecation over removal:

1. Mark schema elements with the `@deprecated(reason: "…")` directive, pointing to
   the replacement.
2. Note the deprecation in the changelog/release notes.
3. Keep the deprecated element working for **at least one minor release and 90
   days** before removing it in a subsequent **major**.

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

CI then builds and publishes the npm package (with provenance) and the Docker
images. Choose the bump level according to the rules above.

## Supported versions

The latest released **MAJOR.MINOR** receives bug and security fixes. Older lines
are supported on a best-effort basis.
