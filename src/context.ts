import { Span } from '@opentelemetry/tracing';
import { ArchiveNodeAdapter, DatabaseAdapter } from './db';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
  [OPEN_TELEMETRY_GRAPHQL: symbol]: Span | undefined;
}

export async function buildContext(connectionString: string | undefined) {
  const db_client = new ArchiveNodeAdapter(connectionString);
  await db_client.checkSQLSchema();

  return {
    db_client,
  };
}
