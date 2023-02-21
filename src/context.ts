import { ArchiveNodeAdapter, DatabaseAdapter } from './db';

export interface GraphQLContext {
  db_client: DatabaseAdapter;
}

export function buildContext() {
  return {
    db_client: new ArchiveNodeAdapter(process.env.PG_CONN),
  };
}
