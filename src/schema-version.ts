/**
 * The version of the GraphQL schema this server serves, as `MAJOR.MINOR`.
 *
 * This is **not** the package version. The package version describes this
 * server's own surface — its flags, its defaults, its behaviour. This constant
 * describes only the contract a client codes against: the types, fields and
 * arguments in `schema.graphql`.
 *
 * The client SDKs pin the schema version they were written against
 * (`SCHEMA_VERSION` in the JS and Rust SDKs, `SchemaVersion` in the Go one) and
 * compare it with what this server reports through the `schemaVersion` query.
 * Before that query existed, the pin was an assertion no client could check.
 *
 * When to change it:
 *
 * - **MINOR** for an additive change: a new query, a new optional argument, a
 *   new field on an output type. A client written against an older minor of the
 *   same major keeps working.
 * - **MAJOR** for a change that can break a client: a removed or renamed field,
 *   a narrowed type, an argument that becomes required, or a field that becomes
 *   nullable when clients were entitled to assume it was not.
 */
export const SCHEMA_VERSION = '1.0';
