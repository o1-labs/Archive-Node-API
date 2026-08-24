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
          TRUST_PROXY: '2',
        }),
        { max: 100, windowMs: 5000, trustProxy: 2, trustProxyConfigured: true }
      );
    });

    test('trusts no proxy hops by default', () => {
      assert.strictEqual(resolveRateLimitConfig({}).trustProxy, 0);
      assert.strictEqual(resolveRateLimitConfig({}).trustProxyConfigured, false);
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
          TRUST_PROXY: 'yes',
        }),
        RATE_LIMIT_DEFAULTS
      );
    });

    test('an unset TRUST_PROXY is not the same as an explicit 0', () => {
      assert.strictEqual(resolveRateLimitConfig({}).trustProxyConfigured, false);
      assert.strictEqual(
        resolveRateLimitConfig({ TRUST_PROXY: '0' }).trustProxyConfigured,
        true
      );
      assert.strictEqual(
        resolveRateLimitConfig({ TRUST_PROXY: 'yes' }).trustProxyConfigured,
        false
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
    /** `trustProxy` mirrors the deployment topology: 1 = one LB in front. */
    function makeServer(trustProxy = '1') {
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [
          useRateLimit(
            {
              RATE_LIMIT_MAX: '2',
              RATE_LIMIT_WINDOW_MS: '10000',
              TRUST_PROXY: trustProxy,
            },
            () => {}
          ),
        ],
      });
      return (forwardedFor?: string) =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
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

    test('a rotated X-Forwarded-For cannot mint fresh buckets', async () => {
      // One LB in front, so the real client is the last entry — the attacker
      // controls only what it prepends, and varying that must not help.
      const request = makeServer('1');
      assert.strictEqual((await request('a.a.a.a, 7.7.7.7')).status, 200);
      assert.strictEqual((await request('b.b.b.b, 7.7.7.7')).status, 200);
      assert.strictEqual((await request('c.c.c.c, 7.7.7.7')).status, 429);
    });

    test('ignores X-Forwarded-For entirely when no proxy is trusted', async () => {
      // Directly exposed: every request keys on the socket address regardless
      // of the header, so rotating it buys nothing.
      const request = makeServer('0');
      assert.strictEqual((await request('1.1.1.1')).status, 200);
      assert.strictEqual((await request('2.2.2.2')).status, 200);
      assert.strictEqual((await request('3.3.3.3')).status, 429);
    });

    test('falls back to the socket when the chain is shorter than the hop count', async () => {
      // Two hops configured but only one entry present: trusting it would mean
      // trusting a client-supplied value, so it must not be used as the key.
      const request = makeServer('2');
      assert.strictEqual((await request('1.1.1.1')).status, 200);
      assert.strictEqual((await request('2.2.2.2')).status, 200);
      assert.strictEqual((await request('3.3.3.3')).status, 429);
    });

    test('stays inert until TRUST_PROXY states the topology', async () => {
      const warnings: string[] = [];
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [
          useRateLimit({ RATE_LIMIT_MAX: '1' }, (message) =>
            warnings.push(message)
          ),
        ],
      });
      const request = () =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: '{ __typename }' }),
        });

      for (let i = 0; i < 5; i++) {
        assert.strictEqual((await request()).status, 200);
      }
      assert.strictEqual(warnings.length, 1);
      assert.match(
        warnings[0],
        /TRUST_PROXY is not set .* rate limiting is DISABLED/
      );
    });

    test('never counts CORS preflight requests', async () => {
      const origin = 'https://explorer.example.com';
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        cors: { origin, methods: ['GET', 'POST'] },
        plugins: [useRateLimit({ RATE_LIMIT_MAX: '2', TRUST_PROXY: '1' })],
      });
      const preflight = () =>
        yoga.fetch('http://localhost/', {
          method: 'OPTIONS',
          headers: {
            origin,
            'x-forwarded-for': '8.8.8.8',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type',
          },
        });

      for (let i = 0; i < 5; i++) {
        assert.strictEqual((await preflight()).status, 204);
      }

      const post = () =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            'x-forwarded-for': '8.8.8.8',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });
      assert.strictEqual((await post()).status, 200);
      assert.strictEqual((await post()).status, 200);
      assert.strictEqual((await post()).status, 429);
    });

    test('the 429 still carries CORS headers', async () => {
      // Cross-origin browser clients read the short-circuited 429 directly; an
      // ACAO-less response would surface to them as an opaque CORS error
      // instead, hiding the real reason the request failed.
      const origin = 'https://explorer.example.com';
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        cors: { origin },
        plugins: [useRateLimit({ RATE_LIMIT_MAX: '1', TRUST_PROXY: '1' })],
      });
      const request = () =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            'x-forwarded-for': '8.8.8.8',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });

      await request();
      const limited = await request();
      assert.strictEqual(limited.status, 429);
      assert.strictEqual(limited.headers.get('access-control-allow-origin'), origin);
    });

    test('warns once when TRUST_PROXY=0 but traffic is proxied', async () => {
      const warnings: string[] = [];
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [
          useRateLimit({ RATE_LIMIT_MAX: '10', TRUST_PROXY: '0' }, (m) =>
            warnings.push(m)
          ),
        ],
      });
      const request = () =>
        yoga.fetch('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '1.1.1.1',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });

      await request();
      await request();
      // Once, not per request — this runs on every request under load.
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /TRUST_PROXY/);
    });

    test('stays quiet when the topology is configured correctly', async () => {
      const warnings: string[] = [];
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [
          useRateLimit({ RATE_LIMIT_MAX: '10', TRUST_PROXY: '1' }, (m) =>
            warnings.push(m)
          ),
        ],
      });
      await yoga.fetch('http://localhost/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '1.1.1.1',
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      assert.deepStrictEqual(warnings, []);
    });

    test('never rate-limits the healthcheck probe', async () => {
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [useRateLimit({ RATE_LIMIT_MAX: '1', TRUST_PROXY: '1' })],
      });
      const probe = () =>
        yoga.fetch('http://localhost/healthcheck', {
          headers: { 'x-forwarded-for': '4.4.4.4' },
        });
      for (let i = 0; i < 5; i++) {
        assert.notStrictEqual((await probe()).status, 429);
      }
    });

    test('never rate-limits the readiness probe', async () => {
      const yoga = createYoga({
        schema,
        graphqlEndpoint: '/',
        plugins: [useRateLimit({ RATE_LIMIT_MAX: '1', TRUST_PROXY: '1' })],
      });
      const probe = () =>
        yoga.fetch('http://localhost/readiness', {
          headers: { 'x-forwarded-for': '4.4.4.4' },
        });
      for (let i = 0; i < 5; i++) {
        assert.notStrictEqual((await probe()).status, 429);
      }
    });
  });
});
