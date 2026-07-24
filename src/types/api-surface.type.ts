/**
 * The typed API surface for a set of API versions.
 *
 * Every helper here is parameterized over a union `V` of API versions — the
 * versions a client might be speaking. The semantics of a multi-version `V`
 * are those of the version-agnostic case:
 *
 * - A method is present only if it exists in EVERY version of `V`. Methods
 *   introduced or removed mid-union (e.g. `container.*`, v26+) are absent and
 *   require narrowing (see `TrueNasApiClient.supports`) or an escape hatch.
 * - `params` is the intersection across `V` — arguments must be valid for
 *   every version the connection could be speaking.
 * - `response` is the union across `V` — the result may have any of their
 *   shapes.
 *
 * For the (vast) majority of methods whose shape never changed across `V`,
 * the generated chain re-exports make these one and the same type, so
 * intersection and union both collapse to the single real signature.
 *
 * A single-version `V` therefore yields that version's exact surface, and the
 * default `V` — {@link ClientSupportedVersion}, the configured supported
 * range — yields the version-agnostic surface a client gets when the
 * negotiated version is only known at runtime. Widening or narrowing the
 * range in `api-version.config.ts` automatically recomputes it: methods that
 * changed shape in a newly supported version surface as compile errors at
 * affected call sites.
 */

import { apiVersionConfig } from '@/config/api-version.config';
import { ApiDirectoryByVersion, SUPPORTED_API_VERSIONS } from '@/generated';
import { TrueNasMessage } from '@/types/truenas-message.type';

type VersionList = typeof SUPPORTED_API_VERSIONS;
type MinVersion = typeof apiVersionConfig.MIN_SUPPORTED_VERSION;
type MaxVersion = typeof apiVersionConfig.MAX_SUPPORTED_VERSION;

/** Every API version this package ships generated types for. */
export type ApiVersionString = keyof ApiDirectoryByVersion;

/** Tail of `T` beginning at the first element equal to `V` (or `[]`). */
type SkipTo<
  T extends readonly string[],
  V extends string,
> = T extends readonly [infer H extends string, ...infer R extends string[]]
  ? [H] extends [V]
    ? T
    : SkipTo<R, V>
  : [];

/** Prefix of `T` up to and including the first element equal to `V` (or `[]` if absent). */
type TakeTo<
  T extends readonly string[],
  V extends string,
> = T extends readonly [infer H extends string, ...infer R extends string[]]
  ? [H] extends [V]
    ? [H]
    : [H, ...TakeTo<R, V>]
  : [];

/**
 * Every version from `T` onwards, in release order — the type-level twin of
 * `TrueNasApiClient.supports`, which narrows a client to this set.
 */
export type ApiVersionsAtLeast<T extends ApiVersionString> = SkipTo<
  VersionList,
  T
>[number];

/**
 * The API versions this client build supports, per `apiVersionConfig` — the
 * sub-range of {@link SUPPORTED_API_VERSIONS} (every version the package ships
 * types for) that the client will actually negotiate.
 */
export type ClientSupportedVersion = TakeTo<
  SkipTo<VersionList, MinVersion>,
  MaxVersion
>[number];

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

/**
 * `params` / `response` of a directory entry.
 *
 * These take the entry as a naked type parameter so the conditional
 * distributes over the per-version union — one member per version — which is
 * what makes the intersection/union semantics below correct. They also let
 * the surface resolve while the version is still an unresolved type
 * parameter, e.g. inside the generic `TrueNasApi<V>`.
 */
type ParamsOf<T> = T extends { params: infer P } ? P : never;
type ResponseOf<T> = T extends { response: infer R } ? R : never;

/**
 * Union of each version's call directory. `keyof` a union of object types is
 * the intersection of their keys, which is what makes "present in every
 * version of `V`" fall out for free.
 */
type CallDirectories<V extends ApiVersionString> = {
  [K in V]: ApiDirectoryByVersion[K]['call'];
}[V];

/** Union of each version's job directory. */
type JobDirectories<V extends ApiVersionString> = {
  [K in V]: ApiDirectoryByVersion[K]['job'];
}[V];

/** Union of each version's event directory. */
type EventDirectories<V extends ApiVersionString> = {
  [K in V]: ApiDirectoryByVersion[K]['event'];
}[V];

// ── Calls ────────────────────────────────────────────────────────────────────

/** Methods callable on every version in `V`. */
export type ApiCallMethodFor<V extends ApiVersionString> = keyof CallDirectories<V> &
  string;

/** Params for `M` accepted by every version in `V`. */
export type ApiCallParamsFor<
  V extends ApiVersionString,
  M extends ApiCallMethodFor<V>,
> = UnionToIntersection<ParamsOf<CallDirectories<V>[M]>>;

/** Response for `M` as any version in `V` may return it. */
export type ApiCallResponseFor<
  V extends ApiVersionString,
  M extends ApiCallMethodFor<V>,
> = ResponseOf<CallDirectories<V>[M]>;

// ── Jobs ─────────────────────────────────────────────────────────────────────

/** Job methods (long-running, tracked via `core.get_jobs`) present on every version in `V`. */
export type ApiJobMethodFor<V extends ApiVersionString> = keyof JobDirectories<V> &
  string;

/** Params for job `M` accepted by every version in `V`. */
export type ApiJobParamsFor<
  V extends ApiVersionString,
  M extends ApiJobMethodFor<V>,
> = UnionToIntersection<ParamsOf<JobDirectories<V>[M]>>;

/** Final job result for `M` as any version in `V` may produce it. */
export type ApiJobResponseFor<
  V extends ApiVersionString,
  M extends ApiJobMethodFor<V>,
> = ResponseOf<JobDirectories<V>[M]>;

// ── Events ───────────────────────────────────────────────────────────────────

/** Events (`core.subscribe` collections) present on every version in `V`. */
export type ApiEventNameFor<V extends ApiVersionString> = keyof EventDirectories<V> &
  string;

/**
 * Notification kinds for `E` that actually carry a `fields` payload.
 *
 * `removed` notifications usually carry only `{ id }`; `TrueNasApi.events`
 * filters payload-less notifications out at runtime, so they are excluded
 * from the emitted type too.
 */
type EventKindsWithFields<
  V extends ApiVersionString,
  E extends ApiEventNameFor<V>,
> = {
  [K in keyof EventDirectories<V>[E]]: EventDirectories<V>[E][K] extends {
    fields: unknown;
  }
    ? K
    : never;
}[keyof EventDirectories<V>[E]];

/**
 * One `collection_update` notification payload for `E`, as any version in `V`
 * may emit it — a discriminated union over the notification kind
 * (`msg: 'added' | 'changed' | …`), each carrying its own typed `fields`.
 */
export type ApiEventUpdateFor<
  V extends ApiVersionString,
  E extends ApiEventNameFor<V>,
> = {
  [K in EventKindsWithFields<V, E>]: {
    msg: K;
    collection: E;
  } & EventDirectories<V>[E][K];
}[EventKindsWithFields<V, E>];

/**
 * The JSON-RPC notification envelope `TrueNasApi.events` emits for `E`: a
 * `collection_update` message whose params are the typed
 * {@link ApiEventUpdateFor} payload.
 */
export interface CollectionUpdateMessageFor<
  V extends ApiVersionString,
  E extends ApiEventNameFor<V>,
> extends TrueNasMessage {
  method: 'collection_update';
  params: ApiEventUpdateFor<V, E>;
}

// ── Version-agnostic aliases ─────────────────────────────────────────────────
// The surface a client gets when the negotiated version is only known at
// runtime: every version in the configured supported range.

/** Methods callable on every supported version. */
export type ApiCallMethod = ApiCallMethodFor<ClientSupportedVersion>;

/** Params for `M` accepted by every supported version. */
export type ApiCallParams<M extends ApiCallMethod> = ApiCallParamsFor<
  ClientSupportedVersion,
  M
>;

/** Response for `M` as any supported version may return it. */
export type ApiCallResponse<M extends ApiCallMethod> = ApiCallResponseFor<
  ClientSupportedVersion,
  M
>;

/** Job methods present on every supported version. */
export type ApiJobMethod = ApiJobMethodFor<ClientSupportedVersion>;

/** Params for job `M` accepted by every supported version. */
export type ApiJobParams<M extends ApiJobMethod> = ApiJobParamsFor<
  ClientSupportedVersion,
  M
>;

/** Final job result for `M` as any supported version may produce it. */
export type ApiJobResponse<M extends ApiJobMethod> = ApiJobResponseFor<
  ClientSupportedVersion,
  M
>;

/** Events present on every supported version. */
export type ApiEventName = ApiEventNameFor<ClientSupportedVersion>;

/** Typed `collection_update` payload for `E` across the supported range. */
export type ApiEventUpdate<E extends ApiEventName> = ApiEventUpdateFor<
  ClientSupportedVersion,
  E
>;

/** Typed `collection_update` envelope for `E` across the supported range. */
export type CollectionUpdateMessage<E extends ApiEventName> =
  CollectionUpdateMessageFor<ClientSupportedVersion, E>;
