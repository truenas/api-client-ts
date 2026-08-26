/**
 * `@truenas/api-client` — a framework-agnostic, RxJS-first client for the
 * TrueNAS JSON-RPC 2.0 (versioned) API.
 *
 * The curated public API. Everything exported here is the package's contract
 * under semver; connection/socket internals are intentionally not re-exported
 * (reach them via `client.connection` / `client.api` / `client.authenticator`).
 */

// ── Factory (primary entry point) ────────────────────────────────────────────
export { createTrueNasClient } from '@/factory';
export type { CreateClientOptions, DefaultApiDirectory } from '@/factory';

// ── Generated API types (from `middlewared --dump-api --keep-refs`) ──────────
// Version namespaces (v25_10_5, v26_0_0, v27_0_0, …), version-suffixed
// directory aliases (ApiCallDirectoryV27_0_0, ApiDirectoryV27_0_0, …), and the
// query grammar re-exported per version. Regenerate with `yarn generate:api`.
export * from '@/generated';

// ── Clients ──────────────────────────────────────────────────────────────────
export { TrueNasApiClient } from '@/client/truenas-api-client';
export { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
export { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
export { TrueNasApiClientV27 } from '@/client/truenas-api-client-v27';

// ── Version discovery (advanced) ─────────────────────────────────────────────
export { VersionDiscovery } from '@/version-discovery';
export {
  VersionDiscoveryError,
  VersionTooOldError,
  VersionTooNewError,
  VersionEndpointNotFoundError,
  VersionDiscoveryTimeoutError,
  VersionDiscoveryNetworkError,
  NoCompatibleVersionsError,
  InvalidVersionResponseError,
} from '@/errors/version-discovery.errors';

// ── Auth ─────────────────────────────────────────────────────────────────────
export { AuthError, AuthErrorCode } from '@/errors/auth.errors';
export { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';

// ── Logging ──────────────────────────────────────────────────────────────────
export { consoleLogger, noopLogger } from '@/logger';
export type { Logger } from '@/logger';

// ── Version-agnostic operations ──────────────────────────────────────────────
export type { OperationMappings } from '@/types/operation-mappings.interface';

// ── Reading a version's surface ──────────────────────────────────────────────
// The method names a client accepts come from the generated directories, so
// there is no separate list of endpoint constants to import: pass the method
// name as a string literal and the surface decides whether it exists.
export type {
  ApiDirectoryShape,
  ArgsOf,
  BaseApiDirectory,
  CallMethod,
  CallParams,
  CallResponse,
  EventKind,
  EventName,
  EventUnion,
  JobMethod,
  JobParams,
  JobResult,
} from '@/types/api-directory.type';
export type {
  QueryDirectory,
  QueryEntity,
  QueryListOptions,
  QueryMethod,
  QuerySingleOptions,
} from '@/types/query.type';

// ── Core types ───────────────────────────────────────────────────────────────
export { VersionCompatibility } from '@/types/api-version.type';
export type { ApiVersion, ApiVersionResponse } from '@/types/api-version.type';
export { isJobFinished, JobState } from '@/types/job.type';
export type { Job, JobProgress } from '@/types/job.type';
export type { TrueNasDate } from '@/types/truenas-date.type';
export { getApiErrorMessage } from '@/types/api-error.type';
export type { ApiError } from '@/types/api-error.type';
export type { AuthResponse } from '@/types/auth.type';
export type { ApplianceProtocol } from '@/types/transport.type';
export type { Container } from '@/types/container.type';
// Value export, not type-only: `Container.status` is an `AppState`, and
// without the enum itself a consumer has nothing to compare it against —
// they would have to re-declare the string literals and hope they match.
export { AppState } from '@/types/app-query.type';
export type { ApiKeyCreate } from '@/types/api-key-create.type';
