/**
 * Minimal logging surface the client writes to. Consumers inject their own
 * implementation; the package never depends on a concrete logging library.
 * Method signatures mirror the TrueNAS Connect UI `Log` service so call sites
 * port unchanged.
 */
export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Logger that forwards to the global `console`. */
export const consoleLogger: Logger = {
  trace: (message, ...args) => console.trace(message, ...args),
  debug: (message, ...args) => console.debug(message, ...args),
  info: (message, ...args) => console.info(message, ...args),
  warn: (message, ...args) => console.warn(message, ...args),
  error: (message, ...args) => console.error(message, ...args),
};

const noop = (): void => undefined;

/** Logger that discards everything. The default when no logger is provided. */
export const noopLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};
