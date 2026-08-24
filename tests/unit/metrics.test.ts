import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import { createMetrics, useMetrics } from '../../src/server/metrics.js';
import { buildPlugins } from '../../src/server/plugins.js';
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

async function serverWithBuiltPlugins() {
  return createYoga({
    schema,
    graphqlEndpoint: '/',
    plugins: await buildPlugins(),
  });
}

function restoreEnv(variable: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[variable];
  } else {
    process.env[variable] = value;
  }
}

describe('Prometheus metrics', () => {
  test('buildPlugins gates /metrics behind ENABLE_METRICS', async () => {
    const previousMetrics = process.env.ENABLE_METRICS;
    const previousLogging = process.env.ENABLE_LOGGING;
    try {
      delete process.env.ENABLE_METRICS;
      delete process.env.ENABLE_LOGGING;

      const disabled = await serverWithBuiltPlugins();
      const disabledBody = await (
        await disabled.fetch('http://localhost/metrics')
      ).text();
      assert.doesNotMatch(disabledBody, /http_requests_total/);

      process.env.ENABLE_METRICS = 'true';

      const enabled = await serverWithBuiltPlugins();
      const response = await enabled.fetch('http://localhost/metrics');
      assert.strictEqual(response.status, 200);
      assert.match(await response.text(), /http_requests_total/);
    } finally {
      restoreEnv('ENABLE_METRICS', previousMetrics);
      restoreEnv('ENABLE_LOGGING', previousLogging);
    }
  });

  test('serves the exposition format at /metrics', async () => {
    const yoga = serverWithFreshMetrics();
    const response = await yoga.fetch('http://localhost/metrics');
    assert.strictEqual(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
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

  test('in-flight gauge is balanced for short-circuited requests', async () => {
    const metrics = createMetrics({ collectDefault: false });
    const yoga = createYoga({
      schema,
      graphqlEndpoint: '/',
      healthCheckEndpoint: '/healthcheck',
      cors: { origin: '*', methods: ['GET', 'POST'] },
      plugins: [useMetrics(metrics)],
    });

    await yoga.fetch('http://localhost/healthcheck');
    await yoga.fetch('http://localhost/', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://explorer.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    await graphql(yoga);

    const body = await (await yoga.fetch('http://localhost/metrics')).text();
    const line = body
      .split('\n')
      .find((l) => l.startsWith('http_requests_in_flight '));
    assert.strictEqual(line, 'http_requests_in_flight 0');
  });
});
