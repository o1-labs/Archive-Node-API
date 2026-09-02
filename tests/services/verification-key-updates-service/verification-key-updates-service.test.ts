import { describe, test } from 'node:test';
import assert from 'node:assert';
import type postgres from 'postgres';
import { GraphQLError } from 'graphql';
import { BLOCK_RANGE_SIZE } from '../../../src/server/server.js';
import { VerificationKeyUpdatesService } from '../../../src/services/verification-key-updates-service/verification-key-updates-service.js';
import { TracingState } from '../../../src/tracing/tracer.js';

const nullOptions = { tracingState: new TracingState(undefined as any) };

function makeClient() {
  const calls: unknown[][] = [];
  const client = ((...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve([]);
  }) as unknown as postgres.Sql;
  return { client, calls };
}

describe('VerificationKeyUpdatesService', () => {
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
