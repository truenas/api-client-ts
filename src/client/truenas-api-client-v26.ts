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
import type { ApiDirectoryV26_0_0, v26_0_0 } from '@/generated';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { toAppState } from '@/utils/app-state.utils';

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
export class TrueNasApiClientV26 extends TrueNasApiClient<ApiDirectoryV26_0_0> {
  /**
   * Create v26-specific operation mappings
   *
   * Operations return Observable<Job | null>:
   * - Async operations emit Job updates until complete
   * - Sync operations emit null once
   */
  protected createOperations(): OperationMappings {
    return {
      // A polymorphic `.query`, so it goes through the verb rather than
      // `call`: the directory types the raw method's response as the five-way
      // union the server may return, and the verb is what fixes it to a list.
      containerQuery: () =>
        this.api.query('container.query').pipe(
          map(containers => containers.map(toContainer))
        ),

      // container.start is synchronous in v26.0.0 - emit null
      containerStart: (id: string) =>
        this.api
          .call('container.start', [parseInt(id, 10)])
          .pipe(map(() => null)),

      // container.stop emits job updates
      containerStop: (id, options) =>
        this.api.job('container.stop', [
          parseInt(id, 10),
          {
            force: options.force,
            force_after_timeout: options.force,
          },
        ]),

      // v26.0.0 doesn't have container.restart - chain stop + start
      // Emits Job updates during stop, then null when start completes
      containerRestart: (id, options) => {
        const numericId = parseInt(id, 10);
        return this.api
          .job('container.stop', [
            numericId,
            {
              force: options.force,
              force_after_timeout: options.force,
            },
          ])
          .pipe(
            // Collect all job updates to ensure stop fully completes
            toArray(),
            // Re-emit job updates, then call start after stop is done
            switchMap(jobUpdates =>
              concat(
                from(jobUpdates),
                this.api
                  .call('container.start', [numericId])
                  .pipe(map(() => null))
              )
            )
          );
      },
    };
  }

}

/**
 * Transform a v26 `container` entry into the unified Container.
 *
 * `cpu`, `memory` and `image` are not part of `container.query` in v26 and are
 * left unset.
 *
 * `description` used to be read through a widening, because `stripDocs` was
 * deleting every model field of that name along with the docstrings and the
 * generated `ContainerEntry` did not declare one. Both halves are fixed now:
 * the generator discriminates documentation from fields, and this tree is
 * regenerated, so the field is declared and read directly.
 */
function toContainer(container: v26_0_0.ContainerEntry): Container {
  const { description } = container;

  return {
    id: container.id.toString(),
    name: container.name,
    status: toAppState(container.status.state),
    // Optional in the generated entry, required by `Container`.
    autostart: container.autostart ?? false,
    description,
  };
}
