import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  parseBoolean,
  validateConfig,
  assertValidConfig,
} from '../../src/config.js';

describe('parseBoolean', () => {
  test('recognises truthy spellings', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' True ']) {
      assert.strictEqual(parseBoolean(value), true, `expected ${value} → true`);
    }
  });

  test('recognises falsy spellings, including the string "false" (#74)', () => {
    for (const value of ['false', 'FALSE', '0', 'no', 'off', ' false ']) {
      assert.strictEqual(
        parseBoolean(value),
        false,
        `expected ${value} → false`
      );
    }
  });

  test('uses the fallback for undefined/empty/unrecognised', () => {
    assert.strictEqual(parseBoolean(undefined), false);
    assert.strictEqual(parseBoolean(''), false);
    assert.strictEqual(parseBoolean('maybe'), false);
    assert.strictEqual(parseBoolean(undefined, true), true);
  });
});

describe('validateConfig', () => {
  const valid = { PG_CONN: 'postgres://localhost:5432/archive' };

  test('passes for a minimal valid environment', () => {
    assert.deepStrictEqual(validateConfig(valid), []);
  });

  test('requires PG_CONN', () => {
    const errors = validateConfig({});
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /PG_CONN is required/);
  });

  test('accepts multi-host HA connection strings', () => {
    // The HA form documented in docs/getting-started.md. PG_CONN is
    // deliberately only checked for non-emptiness: a stricter URL parser here
    // would reject this and break every HA deployment, so this test exists to
    // make a future "hardening" of the check fail loudly rather than silently.
    assert.deepStrictEqual(
      validateConfig({ PG_CONN: 'postgres://host1:5432,host2:5432/archive' }),
      []
    );
  });

  test('accepts a connection string with credentials and query params', () => {
    assert.deepStrictEqual(
      validateConfig({
        PG_CONN:
          'postgres://user:pw@host1:5432,host2:5432/archive?sslmode=require',
      }),
      []
    );
  });

  test('flags a non-boolean boolean var', () => {
    const errors = validateConfig({ ...valid, ENABLE_JAEGER: 'sometimes' });
    assert.ok(errors.some((e) => /ENABLE_JAEGER must be a boolean/.test(e)));
  });

  test('accepts recognised boolean spellings', () => {
    assert.deepStrictEqual(
      validateConfig({
        ...valid,
        ENABLE_LOGGING: 'no',
        ENABLE_GRAPHIQL: '1',
        ENABLE_METRICS: 'off',
      }),
      []
    );
  });

  test('accepts a valid ENABLED_QUERIES subset', () => {
    assert.deepStrictEqual(
      validateConfig({ ...valid, ENABLED_QUERIES: 'blocks, networkState' }),
      []
    );
  });

  test('rejects a typo in ENABLED_QUERIES that would delete a root field', () => {
    const errors = validateConfig({
      ...valid,
      ENABLED_QUERIES: 'blocks,event',
    });
    assert.ok(errors.some((e) => /unknown queries: event/.test(e)));
  });

  test('rejects an empty ENABLED_QUERIES list', () => {
    assert.ok(
      validateConfig({ ...valid, ENABLED_QUERIES: '' }).some((e) =>
        /ENABLED_QUERIES/.test(e)
      )
    );
  });

  test('flags a non-positive-integer PORT', () => {
    assert.ok(
      validateConfig({ ...valid, PORT: 'abc' }).some((e) => /PORT/.test(e))
    );
    assert.ok(
      validateConfig({ ...valid, PORT: '0' }).some((e) => /PORT/.test(e))
    );
  });

  test('aggregates multiple problems', () => {
    const errors = validateConfig({ PORT: '-1', ENABLE_LOGGING: 'huh' });
    assert.strictEqual(errors.length, 3); // PG_CONN, PORT, ENABLE_LOGGING
  });
});

describe('assertValidConfig', () => {
  test('throws an aggregated error listing every problem', () => {
    assert.throws(
      () => assertValidConfig({ PORT: 'nope' }),
      (err: Error) => {
        assert.match(err.message, /Invalid configuration/);
        assert.match(err.message, /PG_CONN/);
        assert.match(err.message, /PORT/);
        return true;
      }
    );
  });

  test('does not throw for a valid environment', () => {
    assert.doesNotThrow(() =>
      assertValidConfig({ PG_CONN: 'postgres://localhost/db' })
    );
  });
});
