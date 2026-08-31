import { describe, test } from 'node:test';
import assert from 'node:assert';
import type postgres from 'postgres';
import { GraphQLError } from 'graphql';
import { BlockStatusFilter } from '../../../src/blockchain/types.js';
import { BLOCK_RANGE_SIZE } from '../../../src/server/server.js';
import { VerificationKeyUpdatesService } from '../../../src/services/verification-key-updates-service/verification-key-updates-service.js';
import { TracingState } from '../../../src/tracing/tracer.js';

const nullOptions = { tracingState: new TracingState(undefined as any) };

function makeClient(rows: unknown[] = []) {
  const calls: { query: string; params: unknown[] }[] = [];
  const client = {
    unsafe: async (query: string, params: unknown[]) => {
      calls.push({ query, params });
      return rows;
    },
  } as unknown as postgres.Sql;
  return { client, calls };
}

function makeRow() {
  return {
    account_update_id: 42,
    address: 'B62qverificationkeyowner',
    token_id: '1',
    verification_key_hash: '123456789',
    state_hash: '3Nblock',
    parent_hash: '3Nparent',
    height: '101',
    global_slot_since_genesis: '201',
    global_slot_since_hard_fork: '51',
    timestamp: '1700000000000',
    chain_status: 'canonical',
    ledger_hash: 'jxledger',
    distance_from_max_block_height: '2',
    last_vrf_output: 'vrf',
    status: 'applied',
    hash: '5Jtransaction',
    memo: 'memo',
    authorization_kind: 'Proof',
    sequence_number: 3,
    zkapp_account_updates_ids: [41, 42],
  };
}

describe('VerificationKeyUpdatesService', () => {
  test('maps an applied verification-key update with block metadata', async () => {
    const { client, calls } = makeClient([makeRow()]);
    const service = new VerificationKeyUpdatesService(client);

    const result = await service.getVerificationKeyUpdates(
      { verificationKeyHash: '123456789', from: 100, to: 110 },
      nullOptions
    );

    assert.deepStrictEqual(result, [
      {
        accountUpdateId: '42',
        address: 'B62qverificationkeyowner',
        tokenId: '1',
        verificationKeyHash: '123456789',
        blockInfo: {
          height: 101,
          stateHash: '3Nblock',
          parentHash: '3Nparent',
          ledgerHash: 'jxledger',
          chainStatus: 'canonical',
          timestamp: '1700000000000',
          globalSlotSinceHardfork: 51,
          globalSlotSinceGenesis: 201,
          distanceFromMaxBlockHeight: 2,
          lastVrfOutput: 'vrf',
        },
        transactionInfo: {
          status: 'applied',
          hash: '5Jtransaction',
          memo: 'memo',
          authorizationKind: 'Proof',
          sequenceNumber: 3,
          zkappAccountUpdateIds: [41, 42],
        },
      },
    ]);
    assert.deepStrictEqual(calls[0].params, ['123456789', 100, 110]);
    assert.match(calls[0].query, /bzc\.status = 'applied'/);
    assert.match(calls[0].query, /b\.chain_status <> 'orphaned'/);
  });

  test('parameterizes a canonical status filter', async () => {
    const { client, calls } = makeClient();
    const service = new VerificationKeyUpdatesService(client);

    await service.getVerificationKeyUpdates(
      {
        verificationKeyHash: 'hash',
        from: 0,
        to: 1,
        status: BlockStatusFilter.canonical,
      },
      nullOptions
    );

    assert.deepStrictEqual(calls[0].params, ['hash', 0, 1, 'canonical']);
    assert.match(calls[0].query, /b\.chain_status = \$4/);
  });

  test('rejects an empty or reversed range before querying', async () => {
    const { client, calls } = makeClient();
    const service = new VerificationKeyUpdatesService(client);

    await assert.rejects(
      service.getVerificationKeyUpdates(
        { verificationKeyHash: 'hash', from: 10, to: 10 },
        nullOptions
      ),
      (error: GraphQLError) =>
        error.extensions.code === 'BLOCK_RANGE_ERROR' &&
        error.message === 'to must be greater than from'
    );
    assert.strictEqual(calls.length, 0);
  });

  test('rejects a range larger than the configured limit', async () => {
    const { client, calls } = makeClient();
    const service = new VerificationKeyUpdatesService(client);

    await assert.rejects(
      service.getVerificationKeyUpdates(
        {
          verificationKeyHash: 'hash',
          from: 0,
          to: BLOCK_RANGE_SIZE + 1,
        },
        nullOptions
      ),
      (error: GraphQLError) =>
        error.extensions.code === 'BLOCK_RANGE_ERROR' &&
        error.message.includes(`maximum range is ${BLOCK_RANGE_SIZE}`)
    );
    assert.strictEqual(calls.length, 0);
  });
});
