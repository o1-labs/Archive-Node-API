import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import { useReadiness, READINESS_PATH } from '../../src/server/readiness.js';
import { schema } from '../../src/resolvers.js';

function serverWith(ping: () => Promise<boolean>) {
  return createYoga({
    schema,
    graphqlEndpoint: '/',
    plugins: [useReadiness({ ping })],
  });
}

describe('Readiness probe', () => {
  test('returns 200 and "ready" when the database answers', async () => {
    const yoga = serverWith(async () => true);
    const response = await yoga.fetch(`http://localhost${READINESS_PATH}`);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: 'ready' });
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  });

  test('returns 503 and "not ready" when the database is unreachable', async () => {
    const yoga = serverWith(async () => false);
    const response = await yoga.fetch(`http://localhost${READINESS_PATH}`);
    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), { status: 'not ready' });
  });

  test('reports not-ready when the ping exceeds its timeout', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    const yoga = createYoga({
      schema,
      graphqlEndpoint: '/',
      plugins: [
        useReadiness({ ping: () => new Promise<boolean>(() => {}) }, 20),
      ],
    });
    try {
      const response = await yoga.fetch(`http://localhost${READINESS_PATH}`);
      assert.strictEqual(response.status, 503);
      assert.deepStrictEqual(await response.json(), { status: 'not ready' });
    } finally {
      console.warn = originalWarn;
    }
  });

  test('reports not-ready, not 500, when the ping rejects, and leaks nothing', async () => {
    const yoga = serverWith(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
    });
    const response = await yoga.fetch(`http://localhost${READINESS_PATH}`);
    assert.strictEqual(response.status, 503);
    const body = await response.text();
    assert.deepStrictEqual(JSON.parse(body), { status: 'not ready' });
    assert.ok(!body.includes('ECONNREFUSED'));
    assert.ok(!body.includes('5432'));
  });

  test('accepts a trailing slash on the readiness path', async () => {
    const yoga = serverWith(async () => true);
    const response = await yoga.fetch(`http://localhost${READINESS_PATH}/`);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: 'ready' });
  });

  test('does not intercept non-readiness requests', async () => {
    // Even if the DB is "down", a normal GraphQL request is not short-circuited
    // by the readiness plugin — __typename resolves without touching the DB.
    const yoga = serverWith(async () => false);
    const response = await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.data.__typename, 'Query');
  });
});
