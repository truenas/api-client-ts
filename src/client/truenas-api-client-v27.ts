/**
 * TrueNAS API Client for v27.X.Y
 *
 * Handles all v27 versions (v27.0.0, v27.0.1, v27.1.2, etc.). Minor and patch
 * releases within a year are backward compatible, so one implementation covers
 * the series; breaking changes only arrive with the next year.
 *
 * That is what this class supports. What version *discovery* currently admits
 * is narrower: `MAX_SUPPORTED_VERSION` is a concrete version and the range check
 * compares patches, so today only `v27.0.0` clears it — `v27.0.1` and `v27.1.0`
 * are reported too-new and never reach this client. The effect always falls on
 * the newest series and nothing below it, which is why it has gone unnoticed:
 * raising the ceiling to v27.0.0 is what made v26.0.1 admissible in the first
 * place. Closing it means deciding how the ceiling should treat a series rather
 * than a version, which is a change to the compatibility model and not this
 * client's to make.
 *
 * To add version-specific behavior, override the factory methods:
 * - createConnection() - for connection-specific changes
 * - createApi() - for API method changes
 * - createAuthenticator() - for authentication changes
 * - createOperations() - for version-specific operation mappings
 */

import { concat, from, map, switchMap, toArray } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type { ApiDirectoryV27_0_0, v27_0_0 } from '@/generated';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { toSmbStatusParams } from '@/utils/smb-status.utils';
import { toAppState } from '@/utils/app-state.utils';

/**
 * API client for TrueNAS API v27
 *
 * Protocol: JSON-RPC 2.0
 * WebSocket Path: /api/v27.{minor}.{patch}
 *
 * Container operations use the native container.* APIs, as v26 does:
 * - containerQuery → container.query (with response transformation)
 * - containerStart → container.start (synchronous, emits null)
 * - containerStop → container.stop (emits Job updates)
 * - containerRestart → container.stop + container.start (emits Job, then null)
 * - containerDelete → container.delete (a job since v26.0.0; force/recursive)
 *
 * SMB operations:
 * - smbStatus → smb.status, public and gated on `SHARING_SMB_READ`, as v26.
 *   v27 inherits the entry rather than re-declaring it.
 *
 * All five container operations are currently identical to v26's, because v27
 * inherits the container entries the facade touches rather than re-declaring
 * them. Five operations, four entries — `containerRestart` has none of its own,
 * being `container.stop` then `container.start`. Asserted rather than assumed,
 * and re-runnable: the spec pins all four entries — `container.query`,
 * `.start`, `.stop`, `.delete` — against v26's, so the day they diverge is a
 * failure there.
 *
 * `smbStatus` is not among them. Its v27 entry is inherited from v26 too, but
 * nothing pins it the way the container entries are pinned. `tsc` is a partial
 * stand-in and worth stating precisely: this leg reads the method out of the
 * directory, so a v27 entry that *narrowed* the arguments or widened the
 * response past `SmbStatusResponse` would stop compiling here. The reverse
 * would not. A widened `info_level` or a narrowed response still compiles, and
 * the operation would go on advertising the stale union. Add an `Identical<>`
 * assertion beside the container ones if that matters.
 *
 * They are written out here rather than shared with v26 because that is what
 * this repo's one-client-per-series design is for: the two are the same today
 * and are expected to diverge — middleware has no `container.restart` yet, and
 * the chained stop+start below is the workaround for its absence. Factoring the
 * bodies into a common base would couple two versions that exist in order to
 * evolve apart, and the coupling would have to be undone by whichever release
 * diverges first. The `@/generated` types are what guard against them drifting
 * silently — though only as far as the paragraph above says: a directory change
 * this code cannot absorb stops compiling here, and one it can absorb does not.
 */
export class TrueNasApiClientV27 extends TrueNasApiClient<ApiDirectoryV27_0_0> {
  /**
   * Create v27-specific operation mappings
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

      // container.start is synchronous in v27 - emit null
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

      // v27 still has no container.restart - chain stop + start.
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

      // A job since v26.0.0 — middleware made deletion long-running (it stops
      // the container when asked, tears down the libvirt domain and destroys
      // the dataset), and the generated directory moved it out of `call`
      // accordingly. `api.job` is what tracks it; `api.call` would not compile.
      //
      // Options pass straight through when given: the unified
      // `ContainerDeleteOptions` is `force`/`recursive`, exactly what the
      // generated params take.
      //
      // When they are not given the argument is *omitted* rather than passed as
      // `undefined`. `JSON.stringify` renders a trailing `undefined` array
      // element as `null`, and middleware declares `options: ContainerDeleteOptions`
      // with a model default and no `| None` — so `[id, null]` is a validation
      // error rather than "use the defaults", which is the one thing a caller
      // passing nothing is asking for.
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
 * Transform a v27 `container` entry into the unified Container.
 *
 * `cpu`, `memory` and `image` are not part of `container.query` in v27 and are
 * left unset, as in v26. `v27_0_0.ContainerEntry` is v26's, re-exported — v27
 * does not re-declare it — so this reads the same fields for the same reasons.
 */
function toContainer(container: v27_0_0.ContainerEntry): Container {
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
