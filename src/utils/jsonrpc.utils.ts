/**
 * JSON-RPC 2.0 utility functions for versioned TrueNAS API
 */

import { TrueNasMessage } from '@/types/truenas-message.type';
import { randomUUID } from '@/utils/utils';

/**
 * Create a JSON-RPC 2.0 formatted message
 *
 * @param method - The method name to call (e.g., 'core.ping', 'core.set_options')
 * @param params - Optional parameters for the method call. Defaults to empty array.
 * @returns A properly formatted JSON-RPC 2.0 message with generated UUID
 */
export function createJsonRpcMessage(
  method: string,
  params?: unknown
): TrueNasMessage {
  return {
    jsonrpc: '2.0',
    id: randomUUID(),
    method,
    params: params ?? [],
  };
}
