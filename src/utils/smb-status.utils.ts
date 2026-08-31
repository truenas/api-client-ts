import type {
  SmbStatusParams,
  SmbStatusRequest,
} from '@/types/smb-status.type';

/**
 * Build the positional argument array for `smb.status`.
 *
 * Shared by every version's operation rather than written out per client. The
 * two legs invoke the same method on the same wire — one publicly, one not —
 * and the whole claim this operation rests on is that the payload is identical.
 * Building it in one place makes that structurally true instead of a thing two
 * copies happen to agree on.
 *
 * All four positions are always sent, filled with middleware's own defaults for
 * anything the caller left out, rather than omitting the absent ones.
 *
 * Omitting is what `containerDelete` does, and it is wrong here. That method
 * takes `[id, options?]`, so an absent `options` is the *last* element and the
 * array can simply be shorter. These four are independent, so a caller passing
 * only `statusOptions` would leave holes in the middle, and a hole cannot be
 * left empty: `JSON.stringify` renders an `undefined` array element as `null`,
 * and middleware declares all four with model defaults and no `| None`. The
 * server would reject `[null, null, null, {…}]` as a validation error rather
 * than reading it as "use the defaults".
 *
 * Sending the defaults explicitly is not a behaviour change, because they are
 * middleware's defaults and not this client's invention:
 *
 * - `info_level` → `'ALL'`
 * - `filters` → the empty list
 * - `options` → its fields at their own defaults
 * - `status_options` → its five fields at their own defaults
 *
 * The last two are models rather than bare values, so `{}` is what is sent and
 * it validates to exactly those defaults, every field of both having one.
 *
 * Those are the values, which is the claim that matters. The two versions spell
 * the declarations differently and land in the same place — 25.10 writes
 * `QueryFilters()` and `default_factory=SMBStatusOptions` where v26+ writes
 * `Field(default=[])` and `Field(default=SMBStatusOptions())`.
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
