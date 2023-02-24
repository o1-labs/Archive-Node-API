import { ArchiveNodeAdapter, DatabaseAdapter } from './db';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
}

export async function buildContext(connectionString: string | undefined) {
  const db_client = new ArchiveNodeAdapter(connectionString);
  await db_client.checkSQLSchema();

  return {
    db_client,
  };
}
