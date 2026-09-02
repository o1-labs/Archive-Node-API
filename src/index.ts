#!/usr/bin/env node

import { buildContext } from './context.js';
import { buildServer } from './server/server.js';
import { buildPlugins } from './server/plugins.js';
import { createGracefulShutdown } from './server/graceful-shutdown.js';
import { assertValidConfig } from './config.js';

const PORT = process.env.PORT || 8080;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 20000;

function withTimeout(
  label: string,
  ms: number,
  run: () => Promise<unknown>
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run(),
    new Promise<void>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      );
    }),
  ])
    .then(() => undefined)
    .finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
}

(async function main() {
  try {
    assertValidConfig();
    const context = await buildContext(process.env.PG_CONN);
    const { plugins, provider } = await buildPlugins();
    const server = buildServer(context, plugins);

    server.listen(PORT, () => {
      console.info(`Server is running on port: ${PORT}`);
    });

    const shutdown = createGracefulShutdown({
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
      // Stop accepting connections and wait for in-flight requests to drain.
      closeServer: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          // `close` also waits on idle keep-alive sockets, which browser
          // clients hold open for keepAliveTimeout; dropping them keeps the
          // drain prompt so the closers below still run inside the timeout.
          server.closeIdleConnections();
        }),
      closers: [
        // Flush buffered spans without letting an unreachable collector consume
        // the whole shutdown budget.
        () =>
          withTimeout('trace flush', 3000, async () => {
            if (provider) await provider.shutdown();
          }),
        // Close the Postgres pool. postgres.js waits forever by default for
        // open connections, so bound the wait and let the force timer handle any
        // still-running queries.
        () => withTimeout('pg pool close', 5000, () => context.db_client.close()),
      ],
    });

    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      process.on(signal, () => void shutdown(signal));
    });

    // Crashes exit non-zero: an exit 0 reads as a clean stop to Kubernetes and
    // systemd, suppressing restarts and non-zero-exit alerting.
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      void shutdown('uncaughtException', 1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      void shutdown('unhandledRejection', 1);
    });
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1); // exit with an error code
  }
})();
