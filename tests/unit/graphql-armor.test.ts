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
      assert.ok(plugins.length >= 5);
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

  describe('real downstream client queries pass the default limits', () => {
    const downstreamQueries: Record<string, string> = {
      // mina-explorer src/services/api/transactions.ts SearchTransaction
      searchTransactionFull: `
        query SearchTransaction($limit: Int!) {
          blocks(limit: $limit, sortBy: BLOCKHEIGHT_DESC) {
            blockHeight stateHash dateTime
            transactions {
              userCommands { hash kind from to amount fee memo nonce failureReason }
              zkappCommands {
                hash
                failureReasons { failures }
                zkappCommand {
                  memo
                  feePayer { body { publicKey fee } }
                  accountUpdates { body { publicKey } }
                }
              }
            }
          }
        }`,
      // mina-explorer src/services/api/analytics.ts, ANALYTICS_BLOCK_LIMIT = 2000
      analytics: `
        query BlocksAnalytics($limit: Int, $dateTime_gte: DateTime) {
          blocks(query: { canonical: true, dateTime_gte: $dateTime_gte }, sortBy: BLOCKHEIGHT_DESC, limit: $limit) {
            blockHeight dateTime txFees
            transactions { userCommands { hash } zkappCommands { hash } }
          }
        }`,
      // mina-explorer-api app/upstream/archive.py FULL tier, paginated best chain
      blocksFullPaginatedBestChain: `
        query GetBlocksFULLPaginatedBestChain($limit: Int!, $maxBlockHeight: Int!) {
          blocks(query: { blockHeight_lt: $maxBlockHeight, inBestChain: true }, limit: $limit, sortBy: BLOCKHEIGHT_DESC) {
            blockHeight stateHash creator dateTime
            protocolState { consensusState { epoch slot slotSinceGenesis } }
            transactions { coinbase userCommands { hash } zkappCommands { hash } }
          }
          networkState { maxBlockHeight { canonicalMaxBlockHeight pendingMaxBlockHeight } }
        }`,
      readiness: '{ __typename }',
    };

    for (const [name, query] of Object.entries(downstreamQueries)) {
      test(`${name} is not rejected by any armor limit`, async () => {
        const result = await runQuery(query, {});
        const armorError = result.errors?.find((e: { message: string }) =>
          /Syntax Error: (Query depth limit|Query Cost limit|Token limit|Aliases limit)/.test(
            e.message
          )
        );
        assert.strictEqual(
          armorError,
          undefined,
          `armor rejected a production query: ${armorError?.message}`
        );
      });
    }

    test('field-suggestion blocking keeps "Cannot query field" verbatim', async () => {
      const result = await runQuery(
        '{ blocks(limit: 1) { protocolState { consensusState { epoch } } } }',
        {}
      );
      assert.ok(
        result.errors?.some((e: { message: string }) =>
          e.message.startsWith(
            'Cannot query field "protocolState" on type "Block".'
          )
        ),
        `tier-fallback marker lost: ${JSON.stringify(result.errors)}`
      );
    });
  });
});
