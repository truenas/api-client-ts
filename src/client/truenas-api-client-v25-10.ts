/**
 * TrueNAS API Client for v25.10.x
 *
 * Handles all v25.10 patch versions (v25.10.0, v25.10.1, v25.10.2, etc.).
 * Patch versions are backward compatible, so one client implementation
 * handles all patches within the v25.10.x series.
 *
 * To add version-specific behavior, override the factory methods:
 * - createConnection() - for connection-specific changes
 * - createApi() - for API method changes
 * - createAuthenticator() - for authentication changes
 * - createOperations() - for version-specific operation mappings
 */

import { map } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type { ApiDirectoryV25_10_0, v25_10_0 } from '@/generated';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { toAppState } from '@/utils/app-state.utils';

/**
 * API client for TrueNAS API v25.10.x
 *
 * Protocol: JSON-RPC 2.0
 * WebSocket Path: /api/v25.10.{patch}
 *
 * Container operations use virt.instance.* APIs:
 * - containerQuery → virt.instance.query (filtered by type=CONTAINER)
 * - containerStart → virt.instance.start (emits Job updates)
 * - containerStop → virt.instance.stop (emits Job updates)
 * - containerRestart → virt.instance.restart (emits Job updates)
 * - containerDelete → virt.instance.delete (already a job; takes no options)
 */
export class TrueNasApiClientV2510 extends TrueNasApiClient<ApiDirectoryV25_10_0> {
  /**
   * Create v25.10-specific operation mappings
   *
   * virt.instance.* APIs return boolean (true) but emit job events via websocket.
   * We use callAndGetJobId to capture the job ID, then track the job.
   * All operations emit Job updates until the operation completes.
   */
  protected createOperations(): OperationMappings {
    return {
      // A polymorphic `.query`, so it goes through the verb rather than
      // `call`: the directory types the raw method's response as the five-way
      // union the server may return, and the verb is what fixes it to a list.
      containerQuery: () =>
        this.api
          .query('virt.instance.query', [['type', '=', 'CONTAINER']])
          .pipe(map(instances => instances.map(toContainer))),

      containerStart: (id: string) => this.api.job('virt.instance.start', [id]),

      containerStop: (id, options) =>
        this.api.job('virt.instance.stop', [id, options]),

      containerRestart: (id, options) =>
        this.api.job('virt.instance.restart', [id, options]),

      // Already a job here — `virt.instance.delete` has been one since
      // v25.10.0 — so this needs no synthesis, only the id. It takes nothing
      // else: there is no `force` and no `recursive` on this version.
      //
      // Unsupported options are reported rather than dropped. `recursive`
      // destroys child datasets, snapshots and clones irrecoverably, so a
      // caller who asked for it and silently did not get it has been told
      // something false about what just happened to their data. Reporting is
      // all this layer can do — refusing outright would make `ops.containerDelete`
      // unusable on v25.10 for the ordinary case, which is the case that works.
      containerDelete: (id, options) => {
        const unsupported = (['force', 'recursive'] as const).filter(
          (key) => options?.[key]
        );
        if (unsupported.length > 0) {
          // Future tense on purpose: this runs when the operation is built, and
          // the observable is cold, so nothing has been deleted yet and may
          // never be. What is already true at this point is that the options
          // cannot be honoured, which is the part worth saying.
          this.logger.warn(
            'containerDelete: v25.10 has no counterpart for these options and ' +
              'will delete without them',
            { ignored: unsupported, id, method: 'virt.instance.delete' }
          );
        }
        return this.api.job('virt.instance.delete', [id]);
      },
    };
  }

}

/**
 * Transform a v25.10 `virt.instance` entry into the unified Container.
 *
 * The nullable fields were previously typed as always present and passed
 * through unchanged, so a null reached callers through a field declared
 * `string`. They are normalised to `undefined` here, which is what
 * `Container` says optional means.
 */
function toContainer(instance: v25_10_0.VirtInstanceEntry): Container {
  return {
    id: instance.id,
    name: instance.name,
    status: toAppState(instance.status),
    autostart: instance.autostart,
    cpu: instance.cpu ?? undefined,
    memory: instance.memory ?? undefined,
    // The whole image object, not just its description: `Container.image`
    // declares only `description`, but the API returns `architecture`, `os`,
    // `release` and more, and callers were already receiving them. Narrowing
    // to the declared field would take data away to match a type that was
    // always an under-declaration — the same call as the v26 `description`
    // widening, decided the same way.
    image:
      instance.image.description === null
        ? undefined
        : { ...instance.image, description: instance.image.description },
  };
}
