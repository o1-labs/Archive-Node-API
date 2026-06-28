export { parseBoolean, validateConfig, assertValidConfig };

type EnvSource = Record<string, string | undefined>;

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

/** Env vars interpreted as booleans. */
const BOOLEAN_VARS = [
  'ENABLE_GRAPHIQL',
  'ENABLE_INTROSPECTION',
  'ENABLE_LOGGING',
  'ENABLE_METRICS',
  'ENABLE_JAEGER',
  'ENABLE_BLOCK_TRANSACTION_DETAILS',
] as const;

/** Env vars that, when set, must be positive integers. */
const POSITIVE_INT_VARS = ['PORT', 'BLOCK_RANGE_SIZE'] as const;

/**
 * Parse a boolean environment value. Recognises `true/false`, `1/0`, `yes/no`,
 * `on/off` (case-insensitive). Anything unrecognised — including the empty
 * string or `undefined` — yields `fallback`.
 *
 * This replaces ad-hoc truthiness checks like `if (process.env.ENABLE_X)`, which
 * treated the string `"false"` as `true` (#74).
 */
function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function isRecognisedBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return TRUE_VALUES.has(normalized) || FALSE_VALUES.has(normalized);
}

/**
 * Validate the environment, returning a list of human-readable problems (empty
 * when valid). Catches the common misconfigurations — a missing connection
 * string, a non-numeric port, a mistyped boolean — so they surface at startup
 * rather than as confusing runtime behaviour.
 */
function validateConfig(env: EnvSource = process.env): string[] {
  const errors: string[] = [];

  if (!env.PG_CONN || env.PG_CONN.trim() === '') {
    errors.push('PG_CONN is required (Postgres connection string).');
  }

  for (const name of BOOLEAN_VARS) {
    const value = env[name];
    if (value !== undefined && value.trim() !== '' && !isRecognisedBoolean(value)) {
      errors.push(
        `${name} must be a boolean (true/false), got "${value}".`
      );
    }
  }

  for (const name of POSITIVE_INT_VARS) {
    const value = env[name];
    if (value !== undefined && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push(`${name} must be a positive integer, got "${value}".`);
      }
    }
  }

  return errors;
}

/**
 * Validate the environment and throw a single aggregated error if anything is
 * wrong, so the process fails fast at startup with a clear message instead of
 * booting into a broken state.
 */
function assertValidConfig(env: EnvSource = process.env): void {
  const errors = validateConfig(env);
  if (errors.length > 0) {
    throw new Error(
      `Invalid configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}
