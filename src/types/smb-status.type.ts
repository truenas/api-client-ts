import type {
  QueryFilters,
  QueryOptions,
} from '@/generated/shared/query-types';

/**
 * Types for the version-agnostic `ops.smbStatus` operation.
 *
 * `smb.status` is one method with two different standings. On v26+ it is a
 * public, role-gated endpoint (`SHARING_SMB_READ`) and appears in the generated
 * directory. On v25.10 it is declared `private=True`, so `--dump-api` never
 * emitted it and no generated v25.10 type describes it — but the method is
 * there, under the same name, taking the same four positional arguments and
 * returning the same union. These types describe that shared wire contract
 * once, so the operation can present a single shape on every version.
 *
 * They are deliberately *not* re-exports of the generated v26 types. Those
 * describe one version's dump; this describes the contract both versions
 * happen to honour, and the two are only equal for as long as they stay equal.
 */

/**
 * The kind of status being asked for.
 *
 * Neither version offers a seventh, but for two different reasons. v25.10
 * carries a legacy `AUTH_LOG` in its enum and its implementation — it routes to
 * `audit.query` rather than to `smbstatus` — while its own argument model
 * refuses it: the `Literal` there lists exactly these six. It is unreachable
 * even from middleware's own internal calls, because `api_method` validates
 * every invocation. v26+ does not have it at all; the level was deleted rather
 * than left dormant.
 */
export type SmbStatusInfoLevel =
  | 'ALL'
  | 'SESSIONS'
  | 'SHARES'
  | 'LOCKS'
  | 'BYTERANGE'
  | 'NOTIFICATIONS';

/**
 * Server-side options for the status query itself.
 *
 * Field names are snake_case because this object is passed to middleware
 * verbatim; it is the wire shape, not a translation of it.
 *
 * Every field is optional here, matching the generated v26 type. Middleware
 * defaults them on both versions — `verbose` and `resolve_uids` to true,
 * `fast` to false, the two `restrict_*` to empty strings.
 */
export interface SmbStatusOptions {
  verbose?: boolean;
  fast?: boolean;
  restrict_user?: string;
  restrict_session?: string;
  resolve_uids?: boolean;
}

/**
 * Rows returned by `smb.status` are not modelled by either version.
 *
 * The middleware result model is `list[dict] | dict | int` on both, and the
 * dump reproduces that as a `Record<string, unknown>` — the shape genuinely
 * varies with `info_level`, and neither version declares the per-level
 * structures. Callers narrow it themselves.
 */
export type SmbStatusRow = Record<string, unknown>;

/**
 * What `smb.status` may return.
 *
 * The three arms are not interchangeable and which one arrives is decided by
 * the options, not by the info level: `{ count: true }` gives the number,
 * `{ get: true }` a single row, anything else the list. This is the same
 * polymorphism the query verbs exist to resolve, but `smb.status` is not a
 * `.query` method — the generator did not mark it with an `entity` — so the
 * union is returned as-is and the caller narrows.
 */
export type SmbStatusResponse = SmbStatusRow[] | SmbStatusRow | number;

/**
 * Arguments for {@link OperationMappings.smbStatus}.
 *
 * A single object rather than four positional parameters: the wire form is
 * positional and every argument is optional, so a caller wanting only
 * `statusOptions` — the fourth — would otherwise have to pass three
 * placeholder arguments to reach it. The operation maps this back onto the
 * positional array.
 */
export interface SmbStatusRequest {
  /** Defaults to `ALL` on both versions. */
  infoLevel?: SmbStatusInfoLevel;

  /**
   * Query filters applied to the rows.
   *
   * Both versions special-case a lone `uid` or `session_id` equality filter,
   * turning it into the corresponding `restrict_*` status option instead of
   * filtering after the fact.
   *
   * That *overwrites* the status option rather than combining with it. Passing
   * `filters: [['uid', '=', 1000]]` together with
   * `statusOptions: { restrict_user: 'bob' }` sends both, and middleware
   * discards `'bob'`. This is middleware's behaviour on both versions, carried
   * through unchanged — but the two look like they compose and do not, so do
   * not set both.
   */
  filters?: QueryFilters<SmbStatusRow>;

  /** Query options. `{ count: true }` is what makes the result a number. */
  options?: QueryOptions<SmbStatusRow>;

  /** Options for the status command itself. */
  statusOptions?: SmbStatusOptions;
}

/**
 * The positional argument array `smb.status` is invoked with, on every version.
 *
 * Middleware takes four positional arguments and this tuple is that call,
 * spelled once. The labels below are v26+'s field names; v25.10 calls the
 * middle two `query_filters` and `query_options`, and was renamed at v26. That
 * difference never reaches the wire — middleware binds positional arguments by
 * field *order*, not by name — which is the reason one tuple can serve both
 * versions, and the reason the labels here are cosmetic.
 *
 * Fixed-length rather than all-optional on purpose: see `toSmbStatusParams`,
 * which explains why every position is always sent.
 */
export type SmbStatusParams = [
  info_level: SmbStatusInfoLevel,
  filters: QueryFilters<SmbStatusRow>,
  options: QueryOptions<SmbStatusRow>,
  status_options: SmbStatusOptions,
];
