export { resolveCorsOptions };
export type { CorsResult };

const CORS_METHODS = ['GET', 'POST'];

/**
 * Either a Yoga CORS configuration object or `false` to disable CORS entirely
 * (no `Access-Control-Allow-Origin` header → same-origin only).
 */
type CorsResult = false | { origin: string | string[]; methods: string[] };

/**
 * Resolve the Yoga `cors` option from `CORS_ORIGIN`.
 *
 * Secure by default: when `CORS_ORIGIN` is unset, cross-origin browser access is
 * disabled rather than allowed from anywhere. Wide-open access (`*`) is still
 * available, but only as a deliberate opt-in. Server-to-server clients and curl
 * are unaffected by CORS; this only governs browsers calling from another origin.
 *
 * Accepted values:
 *   - unset / empty  → `false` (same-origin only)
 *   - `*`            → allow any origin (explicit opt-in)
 *   - one or more comma-separated origins → allowlist
 */
function resolveCorsOptions(
  env: Record<string, string | undefined> = process.env
): CorsResult {
  const raw = env.CORS_ORIGIN?.trim();
  if (!raw) return false;
  if (raw === '*') return { origin: '*', methods: CORS_METHODS };

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // A value that was non-empty but parsed to nothing (e.g. just commas) falls
  // back to the secure default rather than an empty, surprising allowlist.
  if (origins.length === 0) return false;

  return { origin: origins, methods: CORS_METHODS };
}
