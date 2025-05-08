import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import postgres from 'postgres';
import { getZkappsWithPendingEventsQuery } from '../../src/db/sql/events-actions/queries.js';
import { after, describe, it } from 'node:test';
import { EventOutput } from 'src/resolvers-types.js';
import assert from 'node:assert';

// Fixtures
import J1fu_65_66 from './fixtures/B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu_65_66.json' with { type: "json" };
import J1fu_84_83 from './fixtures/B62qpHtWX41NstxzzUe8xooKogqomDwgJ4CN8J3V2274v5B9dnfJ1fu_84_83.json' with { type: "json" };

const db_client = postgres(process.env.PG_CONN);
/**
 * This gets all the public keys of accounts with events.
 *
 * TODO: This returns ZkApps and validators for some reason.  Ideally it would only return ZkApps.
 */
const zkappsWithPendingEvents = (
  await getZkappsWithPendingEventsQuery(db_client).execute()
).map((x) => x.public_key);

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

after(async () => {
  await db_client.end();
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
  describe('Canonical Chain', () => {
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
  });
  describe('Canonical Chain', () => {
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
  });
});
