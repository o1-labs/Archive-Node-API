import { describe, test } from 'node:test';
import assert from 'node:assert';
import { NetworkService } from '../../src/services/network-service/network-service.js';
import { TracingState } from '../../src/tracing/tracer.js';

// Build a NetworkService whose SQL stub returns the given fake rows. We
// stub the private `executeNetworkStateQuery` to bypass the postgres client
// and exercise only the in-memory processing branch — which is where the
// crash was.
function buildService(rows: { chain_status: string; height: number | string }[]) {
  const svc = new NetworkService({} as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).executeNetworkStateQuery = async () => rows;
  return svc;
}

// Tracing options the service expects; the spans are no-ops in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullOptions = { tracingState: new TracingState(undefined as any) };

describe('NetworkService.getNetworkState', () => {
  test('returns maxBlockHeight=null when archive has no indexed blocks', async () => {
    const svc = buildService([]);
    const state = await svc.getNetworkState(nullOptions);
    assert.strictEqual(state.maxBlockHeight, null);
  });

  test('returns both heights when canonical and pending rows are present', async () => {
    const svc = buildService([
      { chain_status: 'canonical', height: 100 },
      { chain_status: 'pending', height: 110 },
    ]);
    const state = await svc.getNetworkState(nullOptions);
    assert.deepStrictEqual(state.maxBlockHeight, {
      canonicalMaxBlockHeight: 100,
      pendingMaxBlockHeight: 110,
    });
  });

  test('falls back pendingMaxBlockHeight = canonicalMaxBlockHeight when pending row missing', async () => {
    // Previously this crashed with "Cannot read properties of undefined
    // (reading 'height')" because rows.filter(...)[0] was undefined.
    const svc = buildService([{ chain_status: 'canonical', height: 100 }]);
    const state = await svc.getNetworkState(nullOptions);
    assert.deepStrictEqual(state.maxBlockHeight, {
      canonicalMaxBlockHeight: 100,
      pendingMaxBlockHeight: 100,
    });
  });

  test('falls back canonicalMaxBlockHeight = 0 when canonical row missing', async () => {
    const svc = buildService([{ chain_status: 'pending', height: 50 }]);
    const state = await svc.getNetworkState(nullOptions);
    assert.deepStrictEqual(state.maxBlockHeight, {
      canonicalMaxBlockHeight: 0,
      pendingMaxBlockHeight: 50,
    });
  });

  test('coerces stringified heights from postgres to numbers', async () => {
    const svc = buildService([
      { chain_status: 'canonical', height: '7' },
      { chain_status: 'pending', height: '9' },
    ]);
    const state = await svc.getNetworkState(nullOptions);
    assert.strictEqual(state.maxBlockHeight!.canonicalMaxBlockHeight, 7);
    assert.strictEqual(state.maxBlockHeight!.pendingMaxBlockHeight, 9);
  });

  test('ignores extra rows with unexpected chain_status values', async () => {
    const svc = buildService([
      { chain_status: 'canonical', height: 100 },
      { chain_status: 'orphaned', height: 99 },
      { chain_status: 'pending', height: 110 },
    ]);
    const state = await svc.getNetworkState(nullOptions);
    assert.deepStrictEqual(state.maxBlockHeight, {
      canonicalMaxBlockHeight: 100,
      pendingMaxBlockHeight: 110,
    });
  });
});
