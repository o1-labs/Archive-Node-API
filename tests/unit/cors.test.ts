import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createSchema, createYoga } from 'graphql-yoga';
import { resolveCorsOptions, warnIfCorsDisabled } from '../../src/server/cors.js';

const corsBase = {
  methods: ['GET', 'POST'],
  allowedHeaders: ['content-type'],
  credentials: false,
};

describe('CORS configuration', () => {
  test('disables CORS when CORS_ORIGIN is unset (secure default)', () => {
    assert.strictEqual(resolveCorsOptions({}), false);
  });

  test('disables CORS when CORS_ORIGIN is blank', () => {
    assert.strictEqual(resolveCorsOptions({ CORS_ORIGIN: '   ' }), false);
  });

  test('allows any origin only when explicitly set to *', () => {
    assert.deepStrictEqual(resolveCorsOptions({ CORS_ORIGIN: '*' }), {
      origin: '*',
      ...corsBase,
    });
  });

  test('builds an allowlist from a single origin', () => {
    assert.deepStrictEqual(
      resolveCorsOptions({ CORS_ORIGIN: 'https://app.example.com' }),
      { origin: ['https://app.example.com'], ...corsBase }
    );
  });

  test('builds an allowlist from comma-separated origins, trimming whitespace', () => {
    assert.deepStrictEqual(
      resolveCorsOptions({
        CORS_ORIGIN: 'https://a.example.com, https://b.example.com',
      }),
      {
        origin: ['https://a.example.com', 'https://b.example.com'],
        ...corsBase,
      }
    );
  });

  test('preflight emits Vary: Origin and does not allow credentials', async () => {
    const yoga = createYoga({
      schema: createSchema({ typeDefs: 'type Query { hello: String }' }),
      logging: false,
      cors: resolveCorsOptions({
        CORS_ORIGIN: 'https://a.example.com,https://b.example.com',
      }),
    });

    const res = await yoga.fetch('http://localhost/', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://a.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    assert.strictEqual(res.status, 204);
    assert.strictEqual(
      res.headers.get('access-control-allow-origin'),
      'https://a.example.com'
    );
    assert.match(res.headers.get('vary') ?? '', /Origin/);
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
    assert.match(
      res.headers.get('access-control-allow-headers') ?? '',
      /content-type/
    );
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), null);
  });

  test('warns for allowlist entries that are unlikely to match', () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      resolveCorsOptions({
        CORS_ORIGIN: 'HTTPS://App.Example.com,https://app.example.com/,*.example.com',
      });
    } finally {
      console.warn = originalWarn;
    }

    assert.strictEqual(warnings.length, 3);
    assert.ok(warnings.every((warning) => warning.includes('CORS_ORIGIN')));
  });

  test('falls back to the secure default for a value that parses to no origins', () => {
    assert.strictEqual(resolveCorsOptions({ CORS_ORIGIN: ', ,' }), false);
  });

  describe('warnIfCorsDisabled', () => {
    test('warns when CORS is disabled', () => {
      const warnings: string[] = [];
      warnIfCorsDisabled(resolveCorsOptions({}), (m) => warnings.push(m));
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /CORS_ORIGIN/);
    });

    test('stays quiet when an origin is configured', () => {
      const warnings: string[] = [];
      warnIfCorsDisabled(resolveCorsOptions({ CORS_ORIGIN: '*' }), (m) =>
        warnings.push(m)
      );
      warnIfCorsDisabled(
        resolveCorsOptions({ CORS_ORIGIN: 'https://app.example.com' }),
        (m) => warnings.push(m)
      );
      assert.deepStrictEqual(warnings, []);
    });

    test('warns for a value that parses to no origins', () => {
      // Silently blocking browsers because of a typo is the worst case here —
      // the operator believes they configured an allowlist.
      const warnings: string[] = [];
      warnIfCorsDisabled(resolveCorsOptions({ CORS_ORIGIN: ', ,' }), (m) =>
        warnings.push(m)
      );
      assert.strictEqual(warnings.length, 1);
    });
  });
});
