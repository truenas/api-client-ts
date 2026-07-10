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
export type { CreateClientOptions } from '@/factory';

// ── Clients ──────────────────────────────────────────────────────────────────
export { TrueNasApiClient } from '@/client/truenas-api-client';
export { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
export { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';

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

// ── Method names + version-agnostic operations ───────────────────────────────
export { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
export type { OperationMappings } from '@/types/operation-mappings.interface';
export type {
  ApiCallDirectory,
  ApiCallMethod,
  ApiCallParams,
  ApiCallResponse,
} from '@/types/api-call-directory.type';

// ── Core types ───────────────────────────────────────────────────────────────
export { VersionCompatibility } from '@/types/api-version.type';
export type { ApiVersion, ApiVersionResponse } from '@/types/api-version.type';
export { JobState } from '@/types/job.type';
export type { Job } from '@/types/job.type';
export { getApiErrorMessage } from '@/types/api-error.type';
export type { ApiError } from '@/types/api-error.type';
export type { AuthResponse } from '@/types/auth.type';
export type { Container } from '@/types/container.type';
export type { ApiKeyCreate } from '@/types/api-key-create.type';
