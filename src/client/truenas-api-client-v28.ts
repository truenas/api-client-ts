/**
 * TrueNAS API Client for v28.X.Y
 *
 * Handles the whole v28 series; breaking changes only arrive with v28.
 *
 * Discovery admits less: `MAX_SUPPORTED_VERSION` is compared down to the patch,
 * so v28.0.1 and v28.1.0 are reported too new and never reach this client.
 *
 * To add version-specific behavior, override createConnection(), createApi(),
 * createAuthenticator() or createOperations().
 */

import { concat, from, map, switchMap, toArray } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type { ApiDirectoryV28_0_0, v28_0_0 } from '@/generated';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { toSmbStatusParams } from '@/utils/smb-status.utils';
import { toAppState } from '@/utils/app-state.utils';

/**
 * API client for TrueNAS API v28 (JSON-RPC 2.0 over /api/v28.{minor}.{patch}).
 *
 * Operations currently match `TrueNasApiClientV27`'s because v28 inherits every
 * entry they use. The spec pins the four container entries to v27's;
 * `smb.status` is unpinned, so a widened param or narrowed response would
 * still compile here. Duplicated rather than shared so the series can diverge.
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
 * left unset, as in v27. `v28_0_0.ContainerEntry` is v27's, re-exported — v28
 * does not re-declare it — so this reads the same fields for the same reasons.
 */
function toContainer(container: v28_0_0.ContainerEntry): Container {
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
