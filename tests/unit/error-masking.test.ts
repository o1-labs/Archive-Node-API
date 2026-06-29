import { describe, test } from 'node:test';
import assert from 'node:assert';
import { buildYoga } from '../../src/server/server.js';
import type { GraphQLContext } from '../../src/context.js';

// A db_client whose query throws an error carrying sensitive internals — exactly
// the kind of message that must never reach a client.
const SENSITIVE = 'connection to server failed: password=topsecret';

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

  test('still surfaces ordinary GraphQL validation errors verbatim', async () => {
    // Masking must not hide client-facing GraphQL errors (e.g. unknown field).
    const yoga = buildYoga(throwingContext(), []);
    const response = await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ thisFieldDoesNotExist }' }),
    });
    const body = await response.json();
    assert.match(body.errors[0].message, /thisFieldDoesNotExist/);
  });
});
