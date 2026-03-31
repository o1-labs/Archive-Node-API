import type { Sql } from 'postgres';

export function makeClient(): Sql<{}> {
  return {
    query: () => {},
    CLOSE: () => {},
    END: () => {},
    PostgresError: class {},
    options: {},
  } as unknown as Sql<{}>;
}
