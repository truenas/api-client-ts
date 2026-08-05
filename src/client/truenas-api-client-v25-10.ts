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

import { map, switchMap } from 'rxjs';
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

      containerStart: (id: string) =>
        this.api
          .callAndGetJobId('virt.instance.start', [id])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),

      containerStop: (id, options) =>
        this.api
          .callAndGetJobId('virt.instance.stop', [id, options])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),

      containerRestart: (id, options) =>
        this.api
          .callAndGetJobId('virt.instance.restart', [id, options])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),
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
    image:
      instance.image.description === null
        ? undefined
        : { description: instance.image.description },
  };
}
