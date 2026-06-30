import { filter } from 'rxjs';
import { TrueNasMessage } from '@/types/truenas-message.type';

/**
 * RxJS operator that keeps only the message whose JSON-RPC `id` matches `id`.
 * Used to correlate a request with its response over the shared socket stream.
 */
export const withId = (id: string) =>
  filter((msg: TrueNasMessage) => msg.id === id);

/**
 * Generate a UUID. Uses the platform `crypto.randomUUID()` when available; falls
 * back to a manual v4 generator inside cross-origin iframes where it may be blocked.
 */
export function randomUUID(): string {
  if (!isIframe()) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** True when running inside a (cross-origin-safe) iframe; false in Node or on error. */
export function isIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return false;
  }
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
