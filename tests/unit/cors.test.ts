import { describe, test } from 'node:test';
import assert from 'node:assert';
import { resolveCorsOptions } from '../../src/server/cors.js';

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
      methods: ['GET', 'POST'],
    });
  });

  test('builds an allowlist from a single origin', () => {
    assert.deepStrictEqual(
      resolveCorsOptions({ CORS_ORIGIN: 'https://app.example.com' }),
      { origin: ['https://app.example.com'], methods: ['GET', 'POST'] }
    );
  });

  test('builds an allowlist from comma-separated origins, trimming whitespace', () => {
    assert.deepStrictEqual(
      resolveCorsOptions({
        CORS_ORIGIN: 'https://a.example.com, https://b.example.com',
      }),
      {
        origin: ['https://a.example.com', 'https://b.example.com'],
        methods: ['GET', 'POST'],
      }
    );
  });

  test('falls back to the secure default for a value that parses to no origins', () => {
    assert.strictEqual(resolveCorsOptions({ CORS_ORIGIN: ', ,' }), false);
  });
});
