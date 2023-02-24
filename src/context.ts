import { ArchiveNodeAdapter, DatabaseAdapter } from './db';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
}

export async function buildContext(connectionString: string | undefined) {
  const db_client = new ArchiveNodeAdapter(connectionString);
  try {
    await db_client.checkSQLSchema();
  } catch (e) {
    throw new Error(
      `Could not connect to Postgres with the specified connection string. Please check that Postgres is available and that your connection string is correct and try again.\nReason: ${e}`
    );
  }
  return {
    db_client,
  };
}
