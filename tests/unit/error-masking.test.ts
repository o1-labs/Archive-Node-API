import { describe, test } from 'node:test';
import assert from 'node:assert';
import { buildYoga } from '../../src/server/server.js';
import type { GraphQLContext } from '../../src/context.js';

// A db_client whose query throws an error carrying sensitive internals — exactly
// the kind of message that must never reach a client.
const SENSITIVE = 'connection to server failed: password=topsecret';

const VALIDATION_CASES: Array<[string, string, RegExp]> = [
  [
    'Cannot query field',
    '{ blocks(query: { blockHeight_lt: 10 }, limit: 1) { protocolState { consensusState { epoch } } } }',
    /^Cannot query field "protocolState" on type "Block"\./,
  ],
  [
    'unknown input field for inBestChain detection',
    '{ blocks(query: { inBestChainX: true }, limit: 1) { blockHeight } }',
    /Field "inBestChainX" is not defined by type "BlockQueryInput"\./,
  ],
  [
    'Unknown argument',
    '{ blocks(query: { blockHeight_lt: 10 }, limit: 1, bogus: 3) { blockHeight } }',
    /^Unknown argument "bogus" on field "Query\.blocks"\./,
  ],
  [
    'Unknown type',
    'query Q($x: NoSuchInput!) { blocks(query: { blockHeight_lt: 10 }, limit: 1) { blockHeight } }',
    /^Unknown type "NoSuchInput"\./,
  ],
];

function throwingContext(): GraphQLContext {
  const fail = async () => {
    throw new Error(SENSITIVE);
  };
  return {
    db_client: {
      getEvents: fail,
      getActions: fail,
      getNetworkState: fail,
      getBlocks: fail,
    },
  } as unknown as GraphQLContext;
}

describe('Error masking', () => {
  test('masks unexpected resolver/DB errors and leaks no internals', async () => {
    const yoga = buildYoga(throwingContext(), []);
    const response = await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: '{ events(input: { address: "B62" }) { eventData { data } } }',
      }),
    });

    const text = await response.text();
    const body = JSON.parse(text);

    // The client sees a generic masked error...
    assert.ok(body.errors?.length, 'expected an error');
    assert.strictEqual(body.errors[0].message, 'Unexpected error.');
    // ...and none of the sensitive internals leak anywhere in the payload.
    assert.ok(!text.includes('topsecret'), 'must not leak the raw error');
    assert.ok(!text.includes('password'), 'must not leak connection details');
  });

  test('masks unexpected errors without dev extensions under NODE_ENV=development', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';

      const yoga = buildYoga(throwingContext(), []);
      const response = await yoga.fetch('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: '{ events(input: { address: "B62" }) { eventData { data } } }',
        }),
      });

      const text = await response.text();
      const body = JSON.parse(text);
      assert.strictEqual(body.errors[0].message, 'Unexpected error.');
      assert.ok(!text.includes('topsecret'), 'must not leak the raw error');
      assert.ok(!text.includes('originalError'), 'must not leak dev details');
      assert.ok(!text.includes('stack'), 'must not leak stack traces');
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  for (const [name, query, expected] of VALIDATION_CASES) {
    test(`validation error reaches the client verbatim: ${name}`, async () => {
      // Masking must not hide client-facing GraphQL errors. These are the
      // marker strings downstream consumers use for schema fallback behavior.
      const yoga = buildYoga(throwingContext(), []);
      const response = await yoga.fetch('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();
      assert.strictEqual(response.status, 200);
      assert.match(body.errors[0].message, expected);
    });
  }

  test('still surfaces ordinary GraphQL validation errors verbatim', async () => {
    const yoga = buildYoga(throwingContext(), []);
    const response = await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ thisFieldDoesNotExist }' }),
    });
    const body = await response.json();
    // The mina-explorer keys its field-fallback chains on this exact substring,
    // silently degrading to the daemon on a match. Asserting the contract text
    // rather than the field name makes this a regression guard for that client:
    // masking, or a future yoga bump, rewording it would blank Explorer pages.
    assert.match(body.errors[0].message, /Cannot query field/);
    assert.match(body.errors[0].message, /thisFieldDoesNotExist/);
  });

  test('validation errors return HTTP 200 for a client sending no Accept header', async () => {
    // The Explorer's client throws on any non-2xx before it ever reads the
    // GraphQL body, so a 400 here would break its fallbacks outright. Yoga only
    // switches to 400 under `Accept: application/graphql-response+json`, which
    // that client never sends — an implicit content-negotiation default worth
    // pinning, since a future upgrade could flip it unnoticed.
    const yoga = buildYoga(throwingContext(), []);
    const response = await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ thisFieldDoesNotExist }' }),
    });
    assert.strictEqual(response.status, 200);
  });
});
