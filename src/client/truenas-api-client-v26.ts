/**
 * TrueNAS API Client for v26.X.Y
 *
 * Handles all v26 versions (v26.0.0, v26.0.1, v26.1.2, etc.).
 * Minor AND patch versions are backward compatible, so one client implementation
 * handles all patches within the v26 series.
 *
 * To add version-specific behavior, override the factory methods:
 * - createConnection() - for connection-specific changes
 * - createApi() - for API method changes
 * - createAuthenticator() - for authentication changes
 * - createOperations() - for version-specific operation mappings
 */

import { concat, from, map, switchMap, toArray } from 'rxjs';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import type { ContainerEntry } from '@/generated/v26_0_0';
import {
  ApiCallResponseFor,
  ClientSupportedVersion,
} from '@/types/api-surface.type';
import { AppState } from '@/types/app-query.type';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';

/** The supported v26.x.y versions this client can be speaking. */
export type V26ApiVersion = Extract<ClientSupportedVersion, `v26.${string}`>;

/** What `container.query` may return, per the generated directory. */
type ContainerQueryResponse = ApiCallResponseFor<
  V26ApiVersion,
  'container.query'
>;

/**
 * Narrows a `container.query` response to full entries.
 *
 * The generated signature admits a count (`number`), a single entry, and
 * `select`-projected rows (`Record<string, unknown>`) as well as a list — the
 * shape depends on the query options. `containerQuery` passes filters only,
 * so entries are what comes back; this asserts that at the boundary instead
 * of assuming it, so an unexpected shape fails loudly here rather than as
 * `containers.map is not a function` or silently-undefined fields.
 */
function toContainerEntries(
  response: ContainerQueryResponse
): ContainerEntry[] {
  if (!Array.isArray(response)) {
    throw new Error(
      `container.query returned ${typeof response}, expected a list of entries`
    );
  }
  // Projected rows only occur when `select`/`get` is passed, which this call
  // site does not do.
  return response as ContainerEntry[];
}

/**
 * API client for TrueNAS API v26
 *
 * Protocol: JSON-RPC 2.0
 * WebSocket Path: /api/v26.{minor}.{patch}
 *
 * Container operations use native container.* APIs:
 * - containerQuery → container.query (with response transformation)
 * - containerStart → container.start (synchronous, emits null)
 * - containerStop → container.stop (emits Job updates)
 * - containerRestart → container.stop + container.start (emits Job, then null)
 */
export class TrueNasApiClientV26<
  V extends V26ApiVersion = V26ApiVersion,
> extends TrueNasApiClient<V> {
  /**
   * This client's API typed against the whole v26 family.
   *
   * Sound for any `V` this class can be instantiated with: the family-wide
   * surface only admits what every v26 version agrees on, so its methods
   * exist on `V`, its params are accepted by `V`, and its responses cover
   * `V`'s. The ops below need it because `V` is still an unresolved type
   * parameter inside the class body.
   */
  protected get familyApi(): TrueNasApi<V26ApiVersion> {
    return this.api as unknown as TrueNasApi<V26ApiVersion>;
  }

  /**
   * Map v26 status state string to AppState enum
   */
  private static mapStatus(state: string): AppState {
    switch (state.toUpperCase()) {
      case 'RUNNING':
        return AppState.Running;
      case 'STOPPED':
        return AppState.Stopped;
      case 'STOPPING':
        return AppState.Stopping;
      default:
        return AppState.Stopped;
    }
  }

  /**
   * Create v26-specific operation mappings
   *
   * Operations return Observable<Job | null>:
   * - Async operations emit Job updates until complete
   * - Sync operations emit null once
   */
  protected createOperations(): OperationMappings {
    // container.* is v26+, so it is outside the version-agnostic surface —
    // but this client is pinned to v26, so it is fully typed here.
    return {
      containerQuery: () =>
        this.familyApi
          .call(TrueNasEndpoint.ContainerQuery, [[]])
          .pipe(map(response => toContainerEntries(response).map(this.toContainer))),

      // container.start is synchronous in v26.0.0 - emit null
      containerStart: (id: string) =>
        this.familyApi
          .call(TrueNasEndpoint.ContainerStart, [parseInt(id, 10)])
          .pipe(map(() => null)),

      // container.stop emits job updates
      containerStop: (id, options) =>
        this.familyApi
          .callAndGetJobId(TrueNasEndpoint.ContainerStop, [
            parseInt(id, 10),
            {
              force: options.force,
              force_after_timeout: options.force,
            },
          ])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),

      // v26.0.0 doesn't have container.restart - chain stop + start
      // Emits Job updates during stop, then null when start completes
      containerRestart: (id, options) => {
        const numericId = parseInt(id, 10);
        return this.familyApi
          .callAndGetJobId(TrueNasEndpoint.ContainerStop, [
            numericId,
            {
              force: options.force,
              force_after_timeout: options.force,
            },
          ])
          .pipe(
            // Track stop job until it completes
            switchMap(stopJobId => this.api.trackJob(stopJobId)),
            // Collect all job updates to ensure stop fully completes
            toArray(),
            // Re-emit job updates, then call start after stop is done
            switchMap(jobUpdates =>
              concat(
                from(jobUpdates),
                this.familyApi
                  .call(TrueNasEndpoint.ContainerStart, [numericId])
                  .pipe(map(() => null))
              )
            )
          );
      },
    };
  }

  /**
   * Transform a generated v26 `ContainerEntry` to the unified Container type.
   *
   * `autostart` is optional in the generated entry, so it is defaulted rather
   * than passed through — the unified type declares it required, and letting
   * `undefined` through would make a container read as "not autostart" while
   * typed `boolean`.
   *
   * cpu, memory, image and description are not part of v26 `container.query`.
   */
  private toContainer(container: ContainerEntry): Container {
    return {
      id: container.id.toString(),
      name: container.name,
      status: TrueNasApiClientV26.mapStatus(container.status.state),
      autostart: container.autostart ?? false,
    };
  }
}
