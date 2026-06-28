import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import { createMetrics, useMetrics } from '../../src/server/metrics.js';
import { schema } from '../../src/resolvers.js';

function serverWithFreshMetrics() {
  const metrics = createMetrics({ collectDefault: false });
  return createYoga({
    schema,
    graphqlEndpoint: '/',
    plugins: [useMetrics(metrics)],
  });
}

async function graphql(yoga: ReturnType<typeof serverWithFreshMetrics>) {
  return yoga.fetch('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
}

describe('Prometheus metrics', () => {
  test('serves the exposition format at /metrics', async () => {
    const yoga = serverWithFreshMetrics();
    const response = await yoga.fetch('http://localhost/metrics');
    assert.strictEqual(response.status, 200);
    assert.match(
      response.headers.get('content-type') ?? '',
      /text\/plain/
    );
    const body = await response.text();
    assert.match(body, /http_requests_total/);
    assert.match(body, /http_request_duration_seconds/);
    assert.match(body, /http_requests_in_flight/);
  });

  test('counts requests by route and status', async () => {
    const yoga = serverWithFreshMetrics();
    await graphql(yoga);
    await graphql(yoga);

    const body = await (await yoga.fetch('http://localhost/metrics')).text();
    const line = body
      .split('\n')
      .find(
        (l) =>
          l.startsWith('http_requests_total{') &&
          l.includes('route="/"') &&
          l.includes('status="200"')
      );
    assert.ok(line, `expected a counter line for route="/", got:\n${body}`);
    assert.strictEqual(line?.trim().endsWith(' 2'), true);
  });

  test('does not count the /metrics scrape itself', async () => {
    const yoga = serverWithFreshMetrics();
    await yoga.fetch('http://localhost/metrics');
    const body = await (await yoga.fetch('http://localhost/metrics')).text();
    assert.ok(
      !body.includes('route="/metrics"'),
      'the /metrics scrape must not be counted'
    );
  });
});
