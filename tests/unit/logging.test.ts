import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import {
  createLogger,
  resolveYogaLogLevel,
} from '../../src/server/logger.js';
import type { Logger } from '../../src/server/logger.js';
import { useRequestLogging } from '../../src/server/request-logging.js';
import { schema } from '../../src/resolvers.js';

type Entry = { obj: Record<string, unknown>; msg: string };

function captureLogger(entries: Entry[]): Logger {
  return {
    info: (obj: Record<string, unknown>, msg: string) =>
      entries.push({ obj, msg }),
  } as unknown as Logger;
}

function serverWith(entries: Entry[]) {
  return createYoga({
    schema,
    graphqlEndpoint: '/',
    plugins: [useRequestLogging(captureLogger(entries))],
  });
}

describe('createLogger', () => {
  test('honours a valid LOG_LEVEL', () => {
    assert.strictEqual(createLogger({ LOG_LEVEL: 'debug' }).level, 'debug');
  });

  test('falls back to info for an unrecognised level', () => {
    assert.strictEqual(createLogger({ LOG_LEVEL: 'bogus' }).level, 'info');
  });

  test('maps LOG_LEVEL values to Yoga-supported levels', () => {
    assert.strictEqual(resolveYogaLogLevel({ LOG_LEVEL: 'trace' }), 'debug');
    assert.strictEqual(resolveYogaLogLevel({ LOG_LEVEL: 'fatal' }), 'error');
    assert.strictEqual(resolveYogaLogLevel({ LOG_LEVEL: 'silent' }), false);
  });
});

describe('useRequestLogging', () => {
  test('emits one structured access line per request', async () => {
    const entries: Entry[] = [];
    const yoga = serverWith(entries);
    await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    assert.strictEqual(entries.length, 1);
    const { obj, msg } = entries[0];
    assert.strictEqual(msg, 'request completed');
    assert.strictEqual(obj.method, 'POST');
    assert.strictEqual(obj.path, '/');
    assert.strictEqual(obj.status, 200);
    assert.strictEqual(typeof obj.requestId, 'string');
    assert.strictEqual(typeof obj.durationMs, 'number');
  });

  test('honours an inbound X-Request-Id for correlation', async () => {
    const entries: Entry[] = [];
    const yoga = serverWith(entries);
    await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'trace-123',
      },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    assert.strictEqual(entries[0].obj.requestId, 'trace-123');
  });

  test('caps and sanitises an inbound X-Request-Id', async () => {
    const entries: Entry[] = [];
    const yoga = serverWith(entries);
    await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': `bad"\\\u0007id${'A'.repeat(500)}`,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    const id = entries[0].obj.requestId as string;
    assert.strictEqual(id.length, 128);
    assert.match(id, /^[\x20-\x7e]+$/);
    assert.ok(!id.includes('"'));
    assert.ok(!id.includes('\\'));
  });

  test('generates an id when the inbound X-Request-Id is blank', async () => {
    const entries: Entry[] = [];
    const yoga = serverWith(entries);
    await yoga.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': '   ' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    assert.match(entries[0].obj.requestId as string, /^[0-9a-f-]{36}$/);
  });

  test('backfills request metadata for CORS preflight responses', async () => {
    const entries: Entry[] = [];
    const origin = 'https://explorer.example.com';
    const yoga = createYoga({
      schema,
      graphqlEndpoint: '/',
      cors: { origin, methods: ['GET', 'POST'] },
      plugins: [useRequestLogging(captureLogger(entries))],
    });
    await yoga.fetch('http://localhost/', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].obj.method, 'OPTIONS');
    assert.strictEqual(entries[0].obj.status, 204);
    assert.strictEqual(typeof entries[0].obj.requestId, 'string');
    assert.strictEqual(typeof entries[0].obj.durationMs, 'number');
  });

  test('does not access-log probe endpoints', async () => {
    const entries: Entry[] = [];
    const yoga = serverWith(entries);
    await yoga.fetch('http://localhost/healthcheck');
    assert.strictEqual(entries.length, 0);
  });
});
