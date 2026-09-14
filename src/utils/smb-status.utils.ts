import type {
  SmbStatusParams,
  SmbStatusRequest,
} from '@/types/smb-status.type';

/**
 * Build the positional argument array for `smb.status`, shared so every version
 * sends an identical payload.
 *
 * All four positions are always sent, absent ones filled with middleware's own
 * defaults. Unlike `containerDelete`'s trailing options they cannot be omitted:
 * a gap in the middle serializes as `null`, and middleware's parameters have
 * defaults but are not nullable, so `null` fails validation.
 */
export function toSmbStatusParams(
  request: SmbStatusRequest = {}
): SmbStatusParams {
  return [
    request.infoLevel ?? 'ALL',
    request.filters ?? [],
    request.options ?? {},
    request.statusOptions ?? {},
  ];
}
