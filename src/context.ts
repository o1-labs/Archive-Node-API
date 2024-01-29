import { Span } from '@opentelemetry/sdk-trace-base';
import { ArchiveNodeAdapter } from './db/archive-node-adapter/archive-node-adapter.js';
import { DatabaseAdapter } from './db/archive-node-adapter/archive-node-adapter.interface.js';

export { buildContext, GraphQLContext };

interface GraphQLContext {
  db_client: DatabaseAdapter;
  [OPEN_TELEMETRY_GRAPHQL: symbol]: Span | undefined; // Will only be set if we are in the scope of a GraphQL request
}

async function buildContext(connectionString: string | undefined) {
  const db_client = new ArchiveNodeAdapter(connectionString);
  await db_client.checkSQLSchema();
  return {
    db_client,
  };
}
