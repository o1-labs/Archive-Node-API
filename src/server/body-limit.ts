import type { Plugin } from 'graphql-yoga';

export { useBodyLimit, resolveBodyLimit };

/** Methods that carry a body, and so must declare its length up front. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

type EnvSource = Record<string, string | undefined>;

/**
 * Resolve the cap, in bytes, from `MAX_REQUEST_BODY_BYTES`; `undefined` means no
 * cap. Off by default because enabling a request-size cap by default is a
 * breaking change (docs/versioning.md). Public deployments should set it:
 * 262144 (256 KiB) is far above any query this API legitimately serves.
 * Startup validation rejects a malformed value (see src/config.ts).
 */
function resolveBodyLimit(env: EnvSource = process.env): number | undefined {
  const value = env.MAX_REQUEST_BODY_BYTES;
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/**
 * Yoga plugin that rejects a body over the cap with 413, and a body whose
 * length is not declared (e.g. `Transfer-Encoding: chunked`) with 411.
 * graphql-armor bounds a query's shape, but a huge string literal counts as one
 * token and `variables` are not counted at all, so only a byte cap bounds what
 * a single request makes the server buffer and parse. Returns a no-op plugin
 * when no cap is configured.
 *
 * It decides from the `Content-Length` header alone, in `onRequest`, before
 * Yoga reads the body: Node's HTTP parser stops the body at `Content-Length`
 * bytes, so the header is a hard bound. Any method declaring more than the cap
 * gets 413; only POST, PUT and PATCH must declare a length at all.
 *
 * Rejections deliberately omit `Connection: close`. Closing with the body
 * unread makes the kernel reset the connection, and a client (or proxy) that
 * already sent its body often gets that reset before it can read the 413.
 * Instead Node discards the rest of the body as it arrives (nothing is
 * buffered) and keeps the connection; a body that never ends is cut off by the
 * server's `requestTimeout`.
 *
 * Only real HTTP requests carry `Content-Length`: a Request built in-process
 * from a string body has none and would get 411, so this belongs on the HTTP
 * server (`buildServer`), not on every Yoga instance.
 */
function useBodyLimit(env: EnvSource = process.env): Plugin {
  const limit = resolveBodyLimit(env);
  if (limit === undefined) return {};

  return {
    onRequest({ request, endResponse, fetchAPI }) {
      // Yoga's CORS plugin answers preflights before user-land plugins, but it
      // is not installed while CORS is disabled; keep the exemption local.
      if (request.method === 'OPTIONS') return;

      const declared = request.headers.get('content-length');
      if (declared === null) {
        if (!BODY_METHODS.has(request.method)) return;
      } else if (Number(declared) <= limit) {
        return;
      }

      const [status, message, code] =
        declared === null
          ? [411, 'A Content-Length header is required.', 'LENGTH_REQUIRED']
          : [
              413,
              `Request body too large: the limit is ${limit} bytes.`,
              'PAYLOAD_TOO_LARGE',
            ];
      endResponse(
        new fetchAPI.Response(
          JSON.stringify({ errors: [{ message, extensions: { code } }] }),
          {
            status,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    },
  };
}
