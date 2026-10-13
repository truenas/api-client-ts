/**
 * The string `core.subscribe` takes for an event and its arguments.
 *
 * Middleware splits it on the first `:` and parses the rest as JSON
 * (`EventSourceManager.short_name_arg`, then `EventSource.validate_arg`), and
 * the same string comes back as every update's `collection`. No arguments
 * means the bare name, which middleware validates as `{}`.
 */
export function subscriptionName(event: string, params?: unknown): string {
  return params === undefined ? event : `${event}:${JSON.stringify(params)}`;
}
