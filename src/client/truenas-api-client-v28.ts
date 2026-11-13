/**
 * TrueNAS API Client for v28.X.Y
 *
 * Handles the whole v28 series; breaking changes only arrive with v29.
 *
 * Discovery admits less: a version has to be one `SUPPORTED_API_VERSIONS`
 * names, so v28.0.1 and v28.1.0 are reported `Unsupported` and never reach this
 * client until the types are regenerated for them.
 *
 * To add version-specific behavior, override createConnection(), createApi(),
 * createAuthenticator() or createOperations().
 */

import { concat, from, map, switchMap, toArray } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type { ApiDirectoryV28_0_0, v28_0_0 } from '@/generated';
import { AppState } from '@/types/app-query.type';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { toSmbStatusParams } from '@/utils/smb-status.utils';
import { toAppState } from '@/utils/app-state.utils';

/**
 * API client for TrueNAS API v28 (JSON-RPC 2.0 over /api/v28.{minor}.{patch}).
 *
 * Operations no longer all match `TrueNasApiClientV27`'s: v28 made
 * `ContainerEntry.status` nullable, so `toContainer` here handles a null and
 * v27's does not. The rest is still the same work on the same shapes.
 */
export class TrueNasApiClientV28 extends TrueNasApiClient<ApiDirectoryV28_0_0> {
  /**
   * Create v28-specific operation mappings
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

      // container.start is synchronous in v28 - emit null
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

      // v28 still has no container.restart - chain stop + start.
      // Emits Job updates during stop, then null when start completes.
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

      // Absent options are omitted, as in v27: `[id, null]` fails validation.
      containerDelete: (id, options) =>
        this.api.job(
          'container.delete',
          options ? [parseInt(id, 10), options] : [parseInt(id, 10)]
        ),

      // `smb.status` is public here and gated on `SHARING_SMB_READ`, so it is
      // an ordinary `call` read straight out of the generated directory — the
      // one leg of this operation that needs no assertion about the server.
      //
      // Not a query verb: middleware returns the same `list | dict | int`
      // polymorphism a `.query` does, but the generator did not mark the entry
      // with an `entity`, so `api.query` does not accept it and the union is
      // handed to the caller to narrow.
      smbStatus: (request) =>
        this.api.call('smb.status', toSmbStatusParams(request)),
    };
  }

}

/**
 * Transform a v28 `container` entry into the unified Container.
 *
 * `cpu`, `memory` and `image` are not part of `container.query` in v28 and are
 * left unset, as in v27. v28 re-declares `ContainerEntry` where v27's was
 * inherited, for `status` alone; the rest is read for the same reasons.
 */
function toContainer(container: v28_0_0.ContainerEntry): Container {
  const { description } = container;

  return {
    id: container.id.toString(),
    name: container.name,
    // `status` is nullable from v28. Middleware's own word on when: "`null` if
    // `query-options.extra.retrieve_status` is `false`" — so a null is status
    // that was not fetched, not a container in an unreportable state. That is
    // what `Unknown` is for ("no usable state"), and it keeps `Container.status`
    // non-optional for every caller.
    status: container.status ? toAppState(container.status.state) : AppState.Unknown,
    // Optional in the generated entry, required by `Container`.
    autostart: container.autostart ?? false,
    description,
  };
}
