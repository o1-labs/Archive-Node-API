import { Span } from '@opentelemetry/tracing';
import { ArchiveNodeAdapter } from './db/archive-node-adapter/archive-node-adapter';
import { DatabaseAdapter } from './db/archive-node-adapter/archive-node-adapter.interface';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
  [OPEN_TELEMETRY_GRAPHQL: symbol]: Span | undefined; // Will only be set if we are in the scope of a GraphQL request
}

export async function buildContext(connectionString: string | undefined) {
  const db_client = new ArchiveNodeAdapter(connectionString);
  await db_client.checkSQLSchema();
  return {
    db_client,
  };
}

export function getCurrentSpanFromGraphQLContext(context: GraphQLContext) {
  const openTelemetrySymbol = Object.getOwnPropertySymbols(context).find(
    (symbol) => symbol.description === 'OPEN_TELEMETRY_GRAPHQL'
  );
  if (!openTelemetrySymbol) {
    return undefined;
  }
  return context[openTelemetrySymbol];
}
