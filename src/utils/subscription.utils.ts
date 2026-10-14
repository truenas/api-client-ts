/**
 * The string `core.subscribe` takes for an event and its arguments.
 *
 * Middleware splits it on the first `:` and parses the rest as JSON
 * (`EventSourceManager.short_name_arg`, then `EventSource.validate_arg`), and
 * the same string comes back as every update's `collection`. No arguments
 * means the bare name, which middleware validates as `{}`.
 *
 * Object keys are sorted, so equal arguments written in another order name the
 * same subscription rather than opening a second one.
 */
export function subscriptionName(event: string, params?: unknown): string {
  return params === undefined
    ? event
    : `${event}:${JSON.stringify(params, sortKeys)}`;
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}
