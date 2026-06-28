import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import {
  useRateLimit,
  createRateLimiter,
  resolveRateLimitConfig,
  RATE_LIMIT_DEFAULTS,
} from '../../src/server/rate-limit.js';
import { schema } from '../../src/resolvers.js';

describe('Rate limiting', () => {
  describe('resolveRateLimitConfig', () => {
    test('uses defaults when no env vars are set', () => {
      assert.deepStrictEqual(resolveRateLimitConfig({}), RATE_LIMIT_DEFAULTS);
    });

    test('reads valid overrides', () => {
      assert.deepStrictEqual(
        resolveRateLimitConfig({
          RATE_LIMIT_MAX: '100',
          RATE_LIMIT_WINDOW_MS: '5000',
        }),
        { max: 100, windowMs: 5000 }
      );
    });

    test('allows max=0 to disable, but never a zero-length window', () => {
      assert.strictEqual(resolveRateLimitConfig({ RATE_LIMIT_MAX: '0' }).max, 0);
      assert.strictEqual(
        resolveRateLimitConfig({ RATE_LIMIT_WINDOW_MS: '0' }).windowMs,
        1
      );
    });

    test('falls back to defaults on malformed values', () => {
      assert.deepStrictEqual(
        resolveRateLimitConfig({
          RATE_LIMIT_MAX: 'abc',
          RATE_LIMIT_WINDOW_MS: '-5',
        }),
        RATE_LIMIT_DEFAULTS
      );
    });
  });

  describe('createRateLimiter (fixed window)', () => {
    test('allows up to max then blocks within the same window', () => {
      let clock = 1000;
      const limiter = createRateLimiter({ max: 2, windowMs: 100 }, () => clock);
      assert.strictEqual(limiter.check('a').allowed, true);
      assert.strictEqual(limiter.check('a').allowed, true);
      assert.strictEqual(limiter.check('a').allowed, false);
    });

    test('tracks clients independently', () => {
      let clock = 1000;
      const limiter = createRateLimiter({ max: 1, windowMs: 100 }, () => clock);
      assert.strictEqual(limiter.check('a').allowed, true);
      assert.strictEqual(limiter.check('a').allowed, false);
      assert.strictEqual(limiter.check('b').allowed, true);
    });

    test('resets after the window elapses', () => {
      let clock = 1000;
      const limiter = createRateLimiter({ max: 1, windowMs: 100 }, () => clock);
      assert.strictEqual(limiter.check('a').allowed, true);
      assert.strictEqual(limiter.check('a').allowed, false);
      clock += 100;
      assert.strictEqual(limiter.check('a').allowed, true);
    });

    test('prune drops expired buckets', () => {
      let clock = 1000;
      const limiter = createRateLimiter({ max: 5, windowMs: 100 }, () => clock);
      limiter.check('a');
      assert.strictEqual(limiter.size(), 1);
      clock += 100;
      limiter.prune();
      assert.strictEqual(limiter.size(), 0);
    });
  });

  describe('useRateLimit (end-to-end through Yoga)', () => {
    function makeServer() {
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [useRateLimit({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '10000' })],
      });
      return (ip: string) =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });
    }

    test('returns 429 once a client exceeds the limit', async () => {
      const request = makeServer();
      assert.strictEqual((await request('1.2.3.4')).status, 200);
      assert.strictEqual((await request('1.2.3.4')).status, 200);
      const blocked = await request('1.2.3.4');
      assert.strictEqual(blocked.status, 429);
      assert.ok(blocked.headers.get('retry-after'));
    });

    test('does not penalise a different client', async () => {
      const request = makeServer();
      await request('5.5.5.5');
      await request('5.5.5.5');
      await request('5.5.5.5'); // 5.5.5.5 now blocked
      assert.strictEqual((await request('9.9.9.9')).status, 200);
    });
  });
});
