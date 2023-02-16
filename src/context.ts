import type { YogaInitialContext } from 'graphql-yoga';
import { ArchiveNodeAdapter } from './db';

export interface GraphQLContext extends YogaInitialContext {
  db_client: ArchiveNodeAdapter;
}

export function buildContext() {
  return {
    db_client: new ArchiveNodeAdapter(process.env.PG_CONN),
  };
}
