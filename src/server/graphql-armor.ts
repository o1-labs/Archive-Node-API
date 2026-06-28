import { maxDepthPlugin } from '@escape.tech/graphql-armor-max-depth';
import { maxAliasesPlugin } from '@escape.tech/graphql-armor-max-aliases';
import { maxTokensPlugin } from '@escape.tech/graphql-armor-max-tokens';
import { costLimitPlugin } from '@escape.tech/graphql-armor-cost-limit';
import { blockFieldSuggestionsPlugin } from '@escape.tech/graphql-armor-block-field-suggestions';

export { buildArmorPlugins, resolveArmorConfig, ARMOR_DEFAULTS };
export type { ArmorConfig };

/**
 * Query-cost protections for the public GraphQL endpoint. Without these a single
 * deeply-nested, heavily-aliased, or otherwise expensive query can be turned into
 * a denial-of-service against the backing Postgres. The limits are deliberately
 * conservative — they comfortably allow every query this API legitimately serves
 * (the deepest is ~5 levels) while rejecting abusive shapes before execution — and
 * each is tunable via the environment.
 */
interface ArmorConfig {
  /** Max selection-set nesting depth. */
  maxDepth: number;
  /** Max number of aliases in a single operation. */
  maxAliases: number;
  /** Max number of lexical tokens in a document. */
  maxTokens: number;
  /** Max estimated query cost (graphql-armor's depth/field heuristic). */
  maxCost: number;
}

const ARMOR_DEFAULTS: ArmorConfig = {
  maxDepth: 10,
  maxAliases: 15,
  maxTokens: 1000,
  maxCost: 5000,
};

type EnvSource = Record<string, string | undefined>;

/**
 * Parse a positive integer from an env value, falling back to `fallback` when it
 * is missing or malformed. We never throw, so a stray typo can't silently remove
 * a protection — it just reverts to the safe default.
 */
function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function resolveArmorConfig(env: EnvSource = process.env): ArmorConfig {
  return {
    maxDepth: intFromEnv(env.GRAPHQL_MAX_DEPTH, ARMOR_DEFAULTS.maxDepth),
    maxAliases: intFromEnv(env.GRAPHQL_MAX_ALIASES, ARMOR_DEFAULTS.maxAliases),
    maxTokens: intFromEnv(env.GRAPHQL_MAX_TOKENS, ARMOR_DEFAULTS.maxTokens),
    maxCost: intFromEnv(env.GRAPHQL_MAX_COST, ARMOR_DEFAULTS.maxCost),
  };
}

/**
 * Build the graphql-armor envelop plugins that enforce the configured limits.
 * Introspection is ignored by the depth/cost rules so the GraphiQL explorer keeps
 * working when it is explicitly enabled; field suggestions are always blocked so
 * error messages don't leak schema shape (complementing `useDisableIntrospection`).
 */
function buildArmorPlugins(env: EnvSource = process.env) {
  const config = resolveArmorConfig(env);
  return [
    maxDepthPlugin({ n: config.maxDepth, ignoreIntrospection: true }),
    maxAliasesPlugin({ n: config.maxAliases }),
    maxTokensPlugin({ n: config.maxTokens }),
    costLimitPlugin({ maxCost: config.maxCost, ignoreIntrospection: true }),
    blockFieldSuggestionsPlugin(),
  ];
}
