import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createYoga } from 'graphql-yoga';
import {
  buildArmorPlugins,
  resolveArmorConfig,
  ARMOR_DEFAULTS,
} from '../../src/server/graphql-armor.js';
import { schema } from '../../src/resolvers.js';

async function runQuery(query: string, env: Record<string, string>) {
  const yoga = createYoga({
    schema,
    plugins: buildArmorPlugins(env),
    graphqlEndpoint: '/graphql',
  });
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

describe('GraphQL armor configuration', () => {
  describe('resolveArmorConfig', () => {
    test('uses conservative defaults when no env vars are set', () => {
      assert.deepStrictEqual(resolveArmorConfig({}), ARMOR_DEFAULTS);
    });

    test('reads valid overrides from the environment', () => {
      const config = resolveArmorConfig({
        GRAPHQL_MAX_DEPTH: '8',
        GRAPHQL_MAX_ALIASES: '20',
        GRAPHQL_MAX_TOKENS: '2000',
        GRAPHQL_MAX_COST: '8000',
      });
      assert.deepStrictEqual(config, {
        maxDepth: 8,
        maxAliases: 20,
        maxTokens: 2000,
        maxCost: 8000,
      });
    });

    test('falls back to defaults on malformed or non-positive values', () => {
      const config = resolveArmorConfig({
        GRAPHQL_MAX_DEPTH: '0',
        GRAPHQL_MAX_ALIASES: '-5',
        GRAPHQL_MAX_TOKENS: 'abc',
        GRAPHQL_MAX_COST: '',
      });
      assert.deepStrictEqual(config, ARMOR_DEFAULTS);
    });
  });

  describe('buildArmorPlugins', () => {
    test('returns the five armor plugins as envelop plugins', () => {
      const plugins = buildArmorPlugins({});
      assert.strictEqual(plugins.length, 5);
      // Each entry must be a usable envelop plugin (hooks into the lifecycle).
      for (const plugin of plugins) {
        assert.strictEqual(typeof plugin, 'object');
        assert.ok(plugin !== null);
      }
    });
  });

  describe('enforcement (end-to-end through Yoga)', () => {
    const deepQuery =
      '{ networkState { maxBlockHeight { canonicalMaxBlockHeight } } }';

    test('rejects a query that exceeds the depth limit before execution', async () => {
      const result = await runQuery(deepQuery, { GRAPHQL_MAX_DEPTH: '1' });
      assert.ok(
        result.errors?.some((e: { message: string }) =>
          /depth/i.test(e.message)
        ),
        `expected a max-depth error, got: ${JSON.stringify(result.errors)}`
      );
    });

    test('does not raise a depth error when within the limit', async () => {
      // A generous limit must not produce a depth error. (Execution itself is
      // not exercised here — there is no DB — but the query passes validation.)
      const result = await runQuery(deepQuery, { GRAPHQL_MAX_DEPTH: '10' });
      const depthError = result.errors?.some((e: { message: string }) =>
        /depth/i.test(e.message)
      );
      assert.ok(!depthError, 'a within-limit query must not be depth-rejected');
    });
  });
});
