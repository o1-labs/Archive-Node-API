import { describe, test } from 'node:test';
import assert from 'node:assert';
import { resolveCorsOptions, warnIfCorsDisabled } from '../../src/server/cors.js';

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
