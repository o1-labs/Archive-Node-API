export { resolveCorsOptions, warnIfCorsDisabled };
export type { CorsResult };

const CORS_METHODS = ['GET', 'POST'];
// Pinned rather than echoed from Access-Control-Request-Headers: echoing makes
// the adapter drop Vary: Origin on preflight responses while ACAO is per-origin.
const CORS_HEADERS = ['content-type'];

/**
 * Either a Yoga CORS configuration object or `false` to disable CORS entirely
 * (no `Access-Control-Allow-Origin` header → same-origin only).
 */
type CorsResult =
  | false
  | {
      origin: string | string[];
      methods: string[];
      allowedHeaders: string[];
      // This API takes no cookies or Authorization header. Leaving this
      // undefined makes the adapter send Access-Control-Allow-Credentials: true
      // alongside an echoed origin.
      credentials: false;
    };

const corsBase = {
  methods: CORS_METHODS,
  allowedHeaders: CORS_HEADERS,
  credentials: false,
} as const;

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
  if (raw === '*') return { origin: '*', ...corsBase };

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // A value that was non-empty but parsed to nothing (e.g. just commas) falls
  // back to the secure default rather than an empty, surprising allowlist.
  if (origins.length === 0) return false;

  for (const origin of origins) {
    if (
      origin.endsWith('/') ||
      origin !== origin.toLowerCase() ||
      origin.includes('*')
    ) {
      console.warn(
        `[cors] CORS_ORIGIN entry "${origin}" is unlikely to ever match: ` +
          "origins are compared byte-for-byte against the browser's Origin " +
          'header, which is lowercase scheme://host[:port] with no trailing ' +
          'slash. Wildcard subdomains are not supported.'
      );
    }
  }

  return { origin: origins, ...corsBase };
}

/**
 * Announce the secure default at startup.
 *
 * When CORS is disabled, a browser client's requests fail in the browser — the
 * server answers normally and logs nothing, so the only symptom is a blank page
 * on someone else's screen. Saying so once at boot turns that into a glance at
 * the logs.
 */
function warnIfCorsDisabled(
  cors: CorsResult,
  warn: (message: string) => void = console.warn
): void {
  if (cors !== false) return;
  warn(
    '[cors] CORS_ORIGIN is unset — cross-origin browser requests are blocked ' +
      '(same-origin only), and they will fail silently from this server\'s side. ' +
      'Set CORS_ORIGIN to your frontend origin(s), or to "*" for a public API ' +
      'any browser may call.'
  );
}
