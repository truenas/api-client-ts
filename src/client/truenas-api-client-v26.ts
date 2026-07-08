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
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { AppState } from '@/types/app-query.type';
import { Container, ContainerQueryV26 } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';

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
export class TrueNasApiClientV26 extends TrueNasApiClient {
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
    return {
      containerQuery: () =>
        this.api
          .call(TrueNasEndpoint.ContainerQuery, [[]])
          .pipe(map(containers => containers.map(this.toContainer))),

      // container.start is synchronous in v26.0.0 - emit null
      containerStart: (id: string) =>
        this.api
          .call(TrueNasEndpoint.ContainerStart, [parseInt(id, 10)])
          .pipe(map(() => null)),

      // container.stop emits job updates
      containerStop: (id, options) =>
        this.api
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
        return this.api
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
                this.api
                  .call(TrueNasEndpoint.ContainerStart, [numericId])
                  .pipe(map(() => null))
              )
            )
          );
      },
    };
  }

  /**
   * Transform v26 ContainerQueryV26 to unified Container type
   */
  private toContainer(container: ContainerQueryV26): Container {
    return {
      id: container.id.toString(),
      name: container.name,
      status: TrueNasApiClientV26.mapStatus(container.status.state),
      autostart: container.autostart,
      description: container.description,
      // cpu and memory are not available in v26 container.query
      // image is not available in v26 container.query
    };
  }
}
