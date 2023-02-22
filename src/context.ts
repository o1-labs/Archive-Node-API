import { ArchiveNodeAdapter, DatabaseAdapter } from './db';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
}

export function buildContext(connectionString: string | undefined) {
  return {
    db_client: new ArchiveNodeAdapter(connectionString),
  };
}
