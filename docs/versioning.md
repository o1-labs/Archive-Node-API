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
- Changing a field's type, or a nullable field/argument to non-null.
- Adding a required (non-null, no-default) argument to an existing field.

Operational contract:

- Removing or renaming an environment variable, or changing its default in a way
  that alters behaviour.
- Removing or renaming an HTTP endpoint (`/`, `/healthcheck`, `/readiness`,
  `/metrics`).

Additive counterparts of the above (new optional field, new nullable argument,
new env var with a safe default) are **minor**, not breaking.

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
