import { filter } from 'rxjs';
import { TrueNasMessage } from '@/types/truenas-message.type';

/**
 * RxJS operator that keeps only the message whose JSON-RPC `id` matches `id`.
 * Used to correlate a request with its response over the shared socket stream.
 */
export const withId = (id: string) =>
  filter((msg: TrueNasMessage) => msg.id === id);

/**
 * Generate a UUID. Uses `crypto.randomUUID()` when available, falling back to a
 * manual v4 generator (built on `crypto.getRandomValues`) for environments where
 * `crypto.randomUUID` is absent — e.g. insecure `http://` (non-localhost) pages,
 * which are not "secure contexts", and older runtimes. Feature-detecting rather
 * than sniffing the environment keeps this correct across the broader set of hosts
 * a redistributable library runs in.
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** True when `date` is within `minutes` of now. */
export function isRecentlyCreated(
  date: Date | null | undefined,
  minutes = 15,
): boolean {
  if (!date) return false;
  const thresholdTime = new Date(Date.now() - minutes * 60 * 1000);
  return date > thresholdTime;
}
