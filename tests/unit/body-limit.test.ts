import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildServer } from '../../src/server/server.js';
import { resolveBodyLimit } from '../../src/server/body-limit.js';
import type { GraphQLContext } from '../../src/context.js';

const ORIGIN = 'https://app.example.com';
const QUERY = '{"query":"{ __typename }"}';
/** The value the docs recommend for public deployments. */
const RECOMMENDED = 262144;

/** A valid GraphQL request body of exactly `bytes` bytes (JSON whitespace pad). */
function bodyOfSize(bytes: number): string {
  const body = QUERY.slice(0, -1) + ' '.repeat(bytes - QUERY.length) + '}';
  assert.strictEqual(Buffer.byteLength(body), bytes);
  return body;
}

function stubContext(): GraphQLContext {
  return { db_client: { ping: async () => true } } as unknown as GraphQLContext;
}

/**
 * Build the real HTTP server with `env` applied (`undefined` unsets a var),
 * restoring process.env after.
 */
async function startServer(
  env: Record<string, string | undefined>
): Promise<Server> {
  const saved = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]])
  );
  const apply = (vars: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(env);
  let server: Server;
  try {
    server = buildServer(stubContext(), []);
  } finally {
    apply(saved);
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface RawRequest {
  method: string;
  path?: string;
  headers?: Record<string, string | number>;
  /** Written in one piece; without a content-length header Node sends it chunked. */
  body?: string;
  /** Send only the headers and never write the body. */
  headersOnly?: boolean;
}

/** One request on a fresh socket, so header framing is exactly what we set. */
function send(server: Server, options: RawRequest): Promise<RawResponse> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method,
        path: options.path ?? '/',
        // `agent: false` alone would send Connection: close; browsers and
        // proxies with upstream keep-alive (ingress-nginx's default) don't.
        headers: {
          origin: ORIGIN,
          connection: 'keep-alive',
          ...options.headers,
        },
        agent: false,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // Drop the kept-alive socket (and, for headersOnly, the body the
          // server is still waiting for).
          req.destroy();
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    // Fail a regression instead of hanging CI.
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
    if (options.headersOnly) {
      req.flushHeaders();
      return;
    }
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function postJson(server: Server, body: string): Promise<RawResponse> {
  return send(server, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
    body,
  });
}

/** POST without Content-Length, so Node sends it with Transfer-Encoding: chunked. */
function postChunked(server: Server, body: string): Promise<RawResponse> {
  return send(server, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function typename(response: RawResponse): string {
  return JSON.parse(response.body).data.__typename;
}

function errorCode(response: RawResponse): string {
  return JSON.parse(response.body).errors[0].extensions.code;
}

describe('resolveBodyLimit', () => {
  test('is off (undefined) when MAX_REQUEST_BODY_BYTES is unset or blank', () => {
    assert.strictEqual(resolveBodyLimit({}), undefined);
    assert.strictEqual(
      resolveBodyLimit({ MAX_REQUEST_BODY_BYTES: '  ' }),
      undefined
    );
  });

  test('honours MAX_REQUEST_BODY_BYTES', () => {
    assert.strictEqual(
      resolveBodyLimit({ MAX_REQUEST_BODY_BYTES: '262144' }),
      262144
    );
  });

  test('treats a malformed value as no cap (startup validation rejects it)', () => {
    for (const value of ['abc', '256k', '1.5', '0', '-1']) {
      assert.strictEqual(
        resolveBodyLimit({ MAX_REQUEST_BODY_BYTES: value }),
        undefined,
        `MAX_REQUEST_BODY_BYTES=${value}`
      );
    }
  });
});

describe('request body limit (MAX_REQUEST_BODY_BYTES unset: no cap)', () => {
  let server: Server;
  before(async () => {
    server = await startServer({
      CORS_ORIGIN: ORIGIN,
      MAX_REQUEST_BODY_BYTES: undefined,
    });
  });
  after(() => stopServer(server));

  test('a chunked POST is answered as before', async () => {
    const response = await postChunked(server, QUERY);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(typename(response), 'Query');
  });

  test('a 300 KiB POST is answered as before', async () => {
    const response = await postJson(server, bodyOfSize(300 * 1024));
    assert.strictEqual(response.status, 200);
    assert.strictEqual(typename(response), 'Query');
  });
});

describe(`request body limit (MAX_REQUEST_BODY_BYTES=${RECOMMENDED})`, () => {
  let server: Server;
  before(async () => {
    server = await startServer({
      CORS_ORIGIN: ORIGIN,
      MAX_REQUEST_BODY_BYTES: String(RECOMMENDED),
    });
  });
  after(() => stopServer(server));

  test('a small POST is answered as before', async () => {
    const response = await postJson(server, QUERY);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(JSON.parse(response.body), {
      data: { __typename: 'Query' },
    });
  });

  test('a body of exactly the cap is allowed', async () => {
    const response = await postJson(server, bodyOfSize(RECOMMENDED));
    assert.strictEqual(response.status, 200);
    assert.strictEqual(typename(response), 'Query');
  });

  test('a declared length over the cap is refused with 413 before the body is read', async () => {
    // The body is never sent: a response proves the server did not wait for it.
    const response = await send(server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': RECOMMENDED + 1,
      },
      headersOnly: true,
    });
    assert.strictEqual(response.status, 413);
    assert.strictEqual(errorCode(response), 'PAYLOAD_TOO_LARGE');
    assert.match(response.headers['content-type'] ?? '', /application\/json/);
    // No Connection: close — see the next test.
    assert.strictEqual(response.headers.connection, 'keep-alive');
    // A browser must see the 413 itself, not an opaque CORS failure.
    assert.strictEqual(response.headers['access-control-allow-origin'], ORIGIN);
  });

  test('a client that already sent an oversized body still reads the 413', async () => {
    // What a buffering proxy (nginx) does: the whole body in one go. Closing
    // with the body unread resets the connection, and the client often gets
    // the reset before the 413; repeat to make that race show up.
    for (let i = 0; i < 20; i++) {
      const response = await postJson(server, bodyOfSize(900_000));
      assert.strictEqual(response.status, 413, `attempt ${i}`);
      assert.strictEqual(errorCode(response), 'PAYLOAD_TOO_LARGE');
    }
  });

  test('any method declaring a length over the cap is refused with 413', async () => {
    for (const method of ['GET', 'DELETE']) {
      const response = await send(server, {
        method,
        headers: { 'content-length': RECOMMENDED + 1 },
        headersOnly: true,
      });
      assert.strictEqual(response.status, 413, method);
    }
  });

  test('a chunked POST without Content-Length is refused with 411', async () => {
    const response = await postChunked(server, QUERY);
    assert.strictEqual(response.status, 411);
    assert.strictEqual(errorCode(response), 'LENGTH_REQUIRED');
    assert.strictEqual(response.headers.connection, 'keep-alive');
    assert.strictEqual(response.headers['access-control-allow-origin'], ORIGIN);
  });

  test('PUT and PATCH must declare their length too', async () => {
    for (const method of ['PUT', 'PATCH']) {
      const response = await send(server, { method, body: QUERY });
      assert.strictEqual(response.status, 411, method);
    }
  });

  test('other methods are not asked for a length', async () => {
    const response = await send(server, { method: 'DELETE', body: QUERY });
    assert.notStrictEqual(response.status, 411);
  });

  test('a GET query is unaffected', async () => {
    const response = await send(server, {
      method: 'GET',
      path: `/?query=${encodeURIComponent('{ __typename }')}`,
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(typename(response), 'Query');
  });

  test('a CORS preflight is still 204', async () => {
    const response = await send(server, {
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers['access-control-allow-origin'], ORIGIN);
  });

  test('a CORS preflight declaring a large body is still 204', async () => {
    const response = await send(server, {
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'POST',
        'content-length': RECOMMENDED + 1,
      },
      headersOnly: true,
    });
    assert.strictEqual(response.status, 204);
  });

  test('the health and readiness probes are unaffected', async () => {
    for (const path of ['/healthcheck', '/readiness']) {
      assert.strictEqual(
        (await send(server, { method: 'GET', path })).status,
        200,
        path
      );
      // Probes answer any method, ahead of the limit.
      const oversized = await send(server, {
        method: 'POST',
        path,
        headers: { 'content-length': RECOMMENDED + 1 },
        headersOnly: true,
      });
      assert.strictEqual(oversized.status, 200, `POST ${path}`);
    }
  });
});

describe('request body limit (MAX_REQUEST_BODY_BYTES=64, CORS disabled)', () => {
  const limit = 64;
  let server: Server;
  before(async () => {
    // buildServer warns that CORS is disabled; that is expected here.
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      server = await startServer({
        CORS_ORIGIN: undefined,
        MAX_REQUEST_BODY_BYTES: String(limit),
      });
    } finally {
      console.warn = originalWarn;
    }
  });
  after(() => stopServer(server));

  test('OPTIONS is never refused, even without the CORS plugin', async () => {
    const response = await send(server, {
      method: 'OPTIONS',
      headers: { 'content-length': limit + 1 },
      headersOnly: true,
    });
    assert.notStrictEqual(response.status, 413);
  });

  test('a body of exactly the configured cap is allowed', async () => {
    const response = await postJson(server, bodyOfSize(limit));
    assert.strictEqual(response.status, 200);
  });

  test('one byte over the configured cap is refused with 413', async () => {
    const response = await postJson(server, bodyOfSize(limit + 1));
    assert.strictEqual(response.status, 413);
    assert.match(JSON.parse(response.body).errors[0].message, /64 bytes/);
  });
});
