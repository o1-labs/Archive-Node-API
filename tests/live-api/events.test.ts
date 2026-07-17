import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import postgres from 'postgres';
import { getZkappsWithPendingEventsQuery } from '../../src/db/sql/events-actions/queries.js';
import { after, before, describe, it } from 'node:test';
import { EventOutput } from 'src/resolvers-types.js';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fixtures resolve against the source tree, not `__dirname`. These tests run
 * compiled out of `build/`, and `tsc` emits only JavaScript — the .json files
 * never land next to the compiled test, so a `__dirname`-relative read fails
 * with ENOENT at module load, taking the whole file down before any test runs.
 * Same approach as tests/integration/setup.ts; npm always runs scripts from the
 * package root.
 */
const fixturesDir = join(process.cwd(), 'tests/live-api/fixtures');

/**
 * The network the J1fu fixtures below were captured from. They pin one network's
 * stateHash / parentHash / eventData at fixed block heights, so on any other
 * network the same heights return different data (or none) and the
 * deepStrictEqual assertions fail deterministically — drift-looking failures
 * that aren't drift. Verified: at blocks 433465–433466 this address returns the
 * fixture data on mainnet and nothing at all on devnet and mesa.
 *
 * Network-agnostic checks (shape, relationships, the k=290 finality depth in
 * networkState.test.ts) are protocol-wide and run everywhere — only the
 * fixture-pinned cases are gated.
 */
const FIXTURE_NETWORK = 'mainnet';

/**
 * Run fixture-pinned cases only against the network they were captured from.
 * When LIVE_API_NETWORK is unset (a local run against whatever
 * STAGING_GRAPHQL_ENDPOINT points at) they still run, preserving today's
 * behaviour for anyone pointing the suite at mainnet by hand.
 */
const fixtureNetwork = process.env.LIVE_API_NETWORK;
const describeOnFixtureNetwork =
  fixtureNetwork === undefined || fixtureNetwork === FIXTURE_NETWORK
    ? describe
    : describe.skip;

// Fixtures
const J1fu_65_66 = JSON.parse(
  readFileSync(
    join(
      fixturesDir,
      'B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu_65_66.json'
    ),
    'utf-8'
  )
);
const J1fu_84_83 = JSON.parse(
  readFileSync(
    join(
      fixturesDir,
      'B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu_84_83.json'
    ),
    'utf-8'
  )
);

let db_client: ReturnType<typeof postgres>;
let zkappsWithPendingEvents: string[];

const endpoint =
  process.env.STAGING_GRAPHQL_ENDPOINT ||
  'http://archive-node-api.gcp.o1test.net/';
const client = new GraphQLClient(endpoint);

const getEventsQuery = gql`
  query getEvents($input: EventFilterOptionsInput!) {
    events(input: $input) {
      blockInfo {
        stateHash
        height
        parentHash
      }
      eventData {
        data
        transactionInfo {
          status
          hash
          memo
        }
      }
    }
  }
`;

before(async () => {
  if (process.env.PG_CONN) {
    db_client = postgres(process.env.PG_CONN);
    zkappsWithPendingEvents = (
      await getZkappsWithPendingEventsQuery(db_client).execute()
    ).map((x) => x.public_key);
  }
});

after(async () => {
  if (db_client) await db_client.end();
});

describe('Events', () => {
  // Skipping until we configure a DB connection for CI
  describe.skip('Pending Chain', () => {
    // Only some, because some of the addresses are not ZkApps, which should be fixed long term.
    it('Some of the zkapps with pending actions should be returned', async () => {
      const totalEvents: any[] = [];
      for (const publicKey of zkappsWithPendingEvents) {
        const input = {
          address: publicKey,
          status: 'PENDING',
        };
        const data: [EventOutput] = await client.request(getEventsQuery, {
          input,
        });
        totalEvents.concat(data);
      }
      console.log(totalEvents);
      assert(
        totalEvents.length > 0,
        'No events found for zkapps with pending actions'
      );
    });
  });
  describeOnFixtureNetwork(
    `Canonical Chain (fixtures: ${FIXTURE_NETWORK})`,
    () => {
      it('Block Filter', async () => {
        const totalEvents: any[] = [];
        const input = {
          address: 'B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu',
          from: 433465,
          to: 433466,
        };
        const data: [EventOutput] = await client.request(getEventsQuery, {
          input,
        });
        totalEvents.concat(data);
        assert.deepStrictEqual(data, J1fu_65_66);
      });
    }
  );
  describeOnFixtureNetwork(
    `Canonical Chain (fixtures: ${FIXTURE_NETWORK})`,
    () => {
      it('Block Filter with several blocks', async () => {
        const totalEvents: any[] = [];
        const input = {
          address: 'B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu',
          to: 439983,
          from: 429984,
        };
        const data: [EventOutput] = await client.request(getEventsQuery, {
          input,
        });
        totalEvents.concat(data);
        console.log(totalEvents);
        assert.deepStrictEqual(data, J1fu_84_83);
      });
    }
  );
});
