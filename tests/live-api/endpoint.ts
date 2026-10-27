/**
 * The archive API the live-api suite runs against.
 *
 * There is deliberately no default: the deployed endpoints are not published
 * in this repository. CI reads them from repository secrets.
 */
const configured = process.env.STAGING_GRAPHQL_ENDPOINT;
if (!configured) {
  throw new Error(
    'STAGING_GRAPHQL_ENDPOINT is not set. Point it at the archive API to test, e.g. http://localhost:8080/'
  );
}

export const endpoint: string = configured;
