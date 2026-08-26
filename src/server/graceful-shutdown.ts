export { createGracefulShutdown };
export type { GracefulShutdownOptions };

interface GracefulShutdownOptions {
  /** Stop accepting connections and resolve once in-flight requests drain. */
  closeServer: () => Promise<void>;
  /** Resource teardown to run after the server closes (flush traces, close DB). */
  closers?: Array<() => Promise<void>>;
  /** Hard deadline; if draining/teardown exceeds it, force exit. */
  timeoutMs: number;
  /** Process exit hook — injectable for tests. */
  onExit?: (code: number) => void;
  /** Log sink — injectable for tests. */
  log?: (message: string, error?: unknown) => void;
}

/**
 * Build an idempotent shutdown handler. On the first invocation it drains the
 * server, runs each closer (a failing closer is logged but doesn't abort the
 * rest), then exits with the caller's code. A hard timeout guarantees the
 * process exits even if a connection or teardown step hangs, and `onExit` is
 * invoked at most once.
 *
 * Subsequent invocations (e.g. a second signal) are ignored.
 */
function createGracefulShutdown(options: GracefulShutdownOptions) {
  const {
    closeServer,
    closers = [],
    timeoutMs,
    onExit = (code) => process.exit(code),
    log = (message, error) =>
      error !== undefined ? console.error(message, error) : console.info(message),
  } = options;

  let started = false;

  /**
   * `exitCode` is the code used when the drain succeeds; a crash-initiated
   * shutdown must pass non-zero so supervisors still see a failed exit.
   */
  return async function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (started) return;
    started = true;
    log(`Shutting down (${reason})…`);

    let exited = false;
    const exitOnce = (code: number) => {
      if (exited) return;
      exited = true;
      onExit(code);
    };

    const forceTimer = setTimeout(() => {
      log('Graceful shutdown timed out; forcing exit.');
      exitOnce(1);
    }, timeoutMs);

    try {
      await closeServer();
      for (const close of closers) {
        try {
          await close();
        } catch (error) {
          log('Error during shutdown step', error);
        }
      }
      exitOnce(exitCode);
    } catch (error) {
      log('Error closing server', error);
      exitOnce(1);
    } finally {
      clearTimeout(forceTimer);
    }
  };
}
