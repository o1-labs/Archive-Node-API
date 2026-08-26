import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createGracefulShutdown } from '../../src/server/graceful-shutdown.js';

const silent = () => {};

describe('Graceful shutdown', () => {
  test('drains the server, runs closers in order, then exits 0', async () => {
    const calls: string[] = [];
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      closeServer: async () => {
        calls.push('server');
      },
      closers: [
        async () => {
          calls.push('traces');
        },
        async () => {
          calls.push('db');
        },
      ],
      timeoutMs: 1000,
      onExit: (code) => exits.push(code),
      log: silent,
    });

    await shutdown('SIGTERM');
    assert.deepStrictEqual(calls, ['server', 'traces', 'db']);
    assert.deepStrictEqual(exits, [0]);
  });

  test('is idempotent — a second signal does nothing', async () => {
    let serverCloses = 0;
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      closeServer: async () => {
        serverCloses += 1;
      },
      timeoutMs: 1000,
      onExit: (code) => exits.push(code),
      log: silent,
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');
    assert.strictEqual(serverCloses, 1);
    assert.deepStrictEqual(exits, [0]);
  });

  test('a failing closer is logged but does not abort the rest', async () => {
    const calls: string[] = [];
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      closeServer: async () => {},
      closers: [
        async () => {
          throw new Error('flush failed');
        },
        async () => {
          calls.push('db');
        },
      ],
      timeoutMs: 1000,
      onExit: (code) => exits.push(code),
      log: silent,
    });

    await shutdown('SIGTERM');
    assert.deepStrictEqual(calls, ['db']);
    assert.deepStrictEqual(exits, [0]);
  });

  test('a crash-initiated shutdown drains cleanly but still exits non-zero', async () => {
    const calls: string[] = [];
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      closeServer: async () => {
        calls.push('server');
      },
      closers: [
        async () => {
          calls.push('traces');
        },
      ],
      timeoutMs: 1000,
      onExit: (code) => exits.push(code),
      log: silent,
    });

    await shutdown('uncaughtException', 1);
    // The drain still runs in full — only the exit code differs from a signal.
    assert.deepStrictEqual(calls, ['server', 'traces']);
    assert.deepStrictEqual(exits, [1]);
  });

  test('exits 1 when draining exceeds the timeout, and only once', async () => {
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      closeServer: () => new Promise<void>(() => {}), // never resolves
      timeoutMs: 20,
      onExit: (code) => exits.push(code),
      log: silent,
    });

    shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepStrictEqual(exits, [1]);
  });
});
