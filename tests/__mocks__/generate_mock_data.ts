// Usage: npx ts-node tests/mocked_sql/generate_mock_data.ts

// Run this script to generate the mocked data for the tests.
// Make sure that you have a local archive node running. See the README for more details.

import postgres from 'postgres';
import fs from 'fs';
import {
  getEventsQuery,
  getActionsQuery,
} from '../../src/db/archive-node-adapter/queries';
import { BlockStatusFilter } from '../../src/models/types';

(async function main() {
  const sql = postgres('postgres://postgres:password@localhost:5432/archive');
  const eventsQuery = await getEventsQuery(
    sql,
    'B62qpS7LDaLc7ZYSbKXDDWJQ4mFbHYQwsivyKyRtjz8e1BjmAjJBJMe',
    'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf',
    BlockStatusFilter.all
  );
  const actionsQuery = await getActionsQuery(
    sql,
    'B62qpS7LDaLc7ZYSbKXDDWJQ4mFbHYQwsivyKyRtjz8e1BjmAjJBJMe',
    'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf',
    BlockStatusFilter.all
  );
  fs.writeFileSync(
    './tests/mocked_sql/database_mock_events.json',
    JSON.stringify(eventsQuery, null, 2)
  );
  fs.writeFileSync(
    './tests/mocked_sql/database_mock_actions.json',
    JSON.stringify(actionsQuery, null, 2)
  );
  process.exit(0);
})();
