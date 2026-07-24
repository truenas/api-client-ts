/**
 * The version-agnostic API surface: what a client may call when the exact
 * negotiated API version is only known at runtime.
 *
 * Derived from the generated per-version directories (`src/generated`) and the
 * configured supported range (`apiVersionConfig.MIN_SUPPORTED_VERSION` ..
 * `MAX_SUPPORTED_VERSION`):
 *
 * - A method is callable version-agnostically only if it exists in EVERY
 *   version of the supported range. Methods introduced or removed mid-range
 *   (e.g. `container.*`, v26+) do not appear here and require narrowing to a
 *   version-specific client.
 * - `params` is the intersection across the range — arguments must be valid
 *   for every version the connection could be speaking.
 * - `response` is the union across the range — the result may have any
 *   in-range version's shape.
 *
 * For the (vast) majority of methods whose shape never changed in-range, the
 * chain re-exports make these one and the same type, so intersection and
 * union both collapse to the single real signature.
 *
 * Widening or narrowing the supported range in `api-version.config.ts`
 * automatically recomputes this surface — methods that changed shape in a
 * newly supported version surface as compile errors at affected call sites.
 */

import { apiVersionConfig } from '@/config/api-version.config';
import {
  ApiDirectoryByVersion,
  SUPPORTED_API_VERSIONS,
} from '@/generated';
import { TrueNasMessage } from '@/types/truenas-message.type';

type VersionList = typeof SUPPORTED_API_VERSIONS;
type MinVersion = typeof apiVersionConfig.MIN_SUPPORTED_VERSION;
type MaxVersion = typeof apiVersionConfig.MAX_SUPPORTED_VERSION;

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
 * The API versions this client build supports, per
 * `apiVersionConfig` — the sub-range of {@link SUPPORTED_API_VERSIONS} (every
 * version the package ships types for) that the client will actually
 * negotiate.
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

/** Union of every in-range version's call directory. `keyof` this union is the set of methods present in ALL of them. */
type SupportedCallDirectories = {
  [V in ClientSupportedVersion]: ApiDirectoryByVersion[V]['call'];
}[ClientSupportedVersion];

/** Union of every in-range version's job directory. */
type SupportedJobDirectories = {
  [V in ClientSupportedVersion]: ApiDirectoryByVersion[V]['job'];
}[ClientSupportedVersion];

/** Methods callable on every supported version (see module doc for semantics). */
export type ApiCallMethod = keyof SupportedCallDirectories & string;

/** Params for `method` accepted by every supported version (intersection across the range). */
export type ApiCallParams<M extends ApiCallMethod> = UnionToIntersection<
  SupportedCallDirectories[M]['params']
>;

/** Response for `method` as any supported version may return it (union across the range). */
export type ApiCallResponse<M extends ApiCallMethod> =
  SupportedCallDirectories[M]['response'];

/** Job methods (long-running, tracked via `core.get_jobs`) present on every supported version. */
export type ApiJobMethod = keyof SupportedJobDirectories & string;

/** Params for job `method` accepted by every supported version. */
export type ApiJobParams<M extends ApiJobMethod> = UnionToIntersection<
  SupportedJobDirectories[M]['params']
>;

/** Final job result for job `method` as any supported version may produce it. */
export type ApiJobResponse<M extends ApiJobMethod> =
  SupportedJobDirectories[M]['response'];

/** Union of every in-range version's event directory. */
type SupportedEventDirectories = {
  [V in ClientSupportedVersion]: ApiDirectoryByVersion[V]['event'];
}[ClientSupportedVersion];

/** Events (`core.subscribe` collections) present on every supported version. */
export type ApiEventName = keyof SupportedEventDirectories & string;

/**
 * Notification kinds for `event` that actually carry a `fields` payload.
 *
 * `removed` notifications usually carry only `{ id }`; `TrueNasApi.events`
 * filters payload-less notifications out at runtime, so they are excluded
 * from the emitted type too.
 */
type EventKindsWithFields<E extends ApiEventName> = {
  [K in keyof SupportedEventDirectories[E]]: SupportedEventDirectories[E][K] extends {
    fields: unknown;
  }
    ? K
    : never;
}[keyof SupportedEventDirectories[E]];

/**
 * One `collection_update` notification payload for `event`, as any supported
 * version may emit it — a discriminated union over the notification kind
 * (`msg: 'added' | 'changed' | …`), each carrying its own typed `fields`.
 */
export type ApiEventUpdate<E extends ApiEventName> = {
  [K in EventKindsWithFields<E>]: {
    msg: K;
    collection: E;
  } & SupportedEventDirectories[E][K];
}[EventKindsWithFields<E>];

/**
 * The JSON-RPC notification envelope `TrueNasApi.events` emits for `event`:
 * a `collection_update` message whose params are the typed
 * {@link ApiEventUpdate} payload.
 */
export interface CollectionUpdateMessage<E extends ApiEventName>
  extends TrueNasMessage {
  method: 'collection_update';
  params: ApiEventUpdate<E>;
}
