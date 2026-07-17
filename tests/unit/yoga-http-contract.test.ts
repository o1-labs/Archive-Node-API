/**
 * Pins the GraphQL-over-HTTP behaviour that browser clients depend on.
 *
 * The mina-explorer's archive client throws on any non-2xx *before* it reads the
 * GraphQL body, then keys its graceful degradation on the exact message
 * "Cannot query field". Both were verified by hand across the yoga 4 → 5 upgrade
 * and are unchanged — but they rest on an implicit content-negotiation default
 * (yoga only switches to 400 under `Accept: application/graphql-response+json`,
 * which that client never sends), so a later bump could flip them unnoticed.
 * These tests turn that from "someone checked once" into a standing guard.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import { schema } from '../../src/resolvers.js';

/** The exact request shape the Explorer sends: POST, JSON, no Accept header. */
function browserClientRequest(query: string) {
  const yoga = createYoga({ schema, graphqlEndpoint: '/' });
  return yoga.fetch('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

describe('GraphQL-over-HTTP contract', () => {
  test('a validation error is HTTP 200, not 400', async () => {
    const response = await browserClientRequest('{ __definitelyNotAField }');
    assert.strictEqual(
      response.status,
      200,
      'a 400 here would make the Explorer throw before reading the error body'
    );
  });

  test('a validation error carries the "Cannot query field" contract string', async () => {
    const response = await browserClientRequest('{ __definitelyNotAField }');
    const body = await response.json();
    assert.match(body.errors[0].message, /Cannot query field/);
  });

  test('a valid query is unaffected', async () => {
    const response = await browserClientRequest('{ __typename }');
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.data.__typename, 'Query');
  });
});
