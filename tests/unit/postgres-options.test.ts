import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  buildPostgresOptions,
  resolvePoolConfig,
  POOL_DEFAULTS,
} from '../../src/db/archive-node-adapter/postgres-options.js';

describe('Postgres pool options', () => {
  describe('resolvePoolConfig', () => {
    test('uses conservative defaults when no env vars are set', () => {
      assert.deepStrictEqual(resolvePoolConfig({}), POOL_DEFAULTS);
    });

    test('reads valid overrides from the environment', () => {
      const config = resolvePoolConfig({
        PG_MAX_CONNECTIONS: '25',
        PG_IDLE_TIMEOUT: '60',
        PG_CONNECT_TIMEOUT: '5',
        PG_STATEMENT_TIMEOUT: '15000',
      });
      assert.deepStrictEqual(config, {
        max: 25,
        idleTimeout: 60,
        connectTimeout: 5,
        statementTimeout: 15000,
      });
    });

    test('falls back to defaults on malformed values', () => {
      const config = resolvePoolConfig({
        PG_MAX_CONNECTIONS: 'abc',
        PG_IDLE_TIMEOUT: '-1',
        PG_CONNECT_TIMEOUT: '1.5',
        PG_STATEMENT_TIMEOUT: '',
      });
      assert.deepStrictEqual(config, POOL_DEFAULTS);
    });

    test('clamps max to at least 1 so the pool can never be empty', () => {
      assert.strictEqual(resolvePoolConfig({ PG_MAX_CONNECTIONS: '0' }).max, 1);
    });

    test('allows statement timeout of 0 to disable the limit', () => {
      assert.strictEqual(
        resolvePoolConfig({ PG_STATEMENT_TIMEOUT: '0' }).statementTimeout,
        0
      );
    });
  });

  describe('buildPostgresOptions', () => {
    test('maps config onto the postgres() options shape', () => {
      const options = buildPostgresOptions({
        PG_MAX_CONNECTIONS: '12',
        PG_IDLE_TIMEOUT: '45',
        PG_CONNECT_TIMEOUT: '7',
        PG_STATEMENT_TIMEOUT: '20000',
      });
      assert.strictEqual(options.max, 12);
      assert.strictEqual(options.idle_timeout, 45);
      assert.strictEqual(options.connect_timeout, 7);
      // statement_timeout is sent as a startup connection parameter.
      assert.deepStrictEqual(options.connection, {
        statement_timeout: 20000,
      });
    });
  });
});
