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
 * `description` is read through a widening because the generated
 * `ContainerEntry` does not declare it while the server does return it.
 *
 * The cause given here used to be "the dump models what middleware declares
 * rather than what it sends", grouping this with `core.get_jobs`. That was
 * wrong. Middleware declares the field plainly —
 * `api/v26_0_0/container.py:61` on stable/26 is
 * `description: str = Field(default="", description="Container description.")`
 * — and it was this repo's own `stripDocs` deleting every model field named
 * `description` along with the docstrings. The generator no longer does;
 * the committed tree still lacks the field because it has not been regenerated.
 *
 * Dropping the field to match the tree would take data away from callers who
 * already receive it, so the divergence stays explicit here. Remove the
 * widening once a regeneration lands the field —
 * `src/generated-known-gaps.spec.ts` fails when it does, so this does not have
 * to be remembered.
 */
function toContainer(container: v26_0_0.ContainerEntry): Container {
  const { description } = container as v26_0_0.ContainerEntry & {
    description?: string;
  };

  return {
    id: container.id.toString(),
    name: container.name,
    status: toAppState(container.status.state),
    // Optional in the generated entry, required by `Container`.
    autostart: container.autostart ?? false,
    description,
  };
}
