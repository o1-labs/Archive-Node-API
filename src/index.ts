#!/usr/bin/env node

import { buildContext } from './context.js';
import { buildServer } from './server/server.js';
import { buildPlugins } from './server/plugins.js';
import { createGracefulShutdown } from './server/graceful-shutdown.js';

const PORT = process.env.PORT || 8080;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000;

(async function main() {
  try {
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
        }),
      closers: [
        // Flush any buffered OpenTelemetry spans before exit.
        async () => {
          if (provider) await provider.shutdown();
        },
        // Close the Postgres connection pool.
        () => context.db_client.close(),
      ],
    });

    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      process.on(signal, () => void shutdown(signal));
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      void shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      void shutdown('unhandledRejection');
    });
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1); // exit with an error code
  }
})();
