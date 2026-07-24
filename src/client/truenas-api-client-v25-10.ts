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
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { ClientSupportedVersion } from '@/types/api-surface.type';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import {
  VirtualInstanceQuery,
  VirtualInstanceType,
} from '@/types/virtual-instance-query.type';

/** The supported v25.10.x patch versions this client can be speaking. */
export type V2510ApiVersion = Extract<
  ClientSupportedVersion,
  `v25.10.${string}`
>;

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
export class TrueNasApiClientV2510<
  V extends V2510ApiVersion = V2510ApiVersion,
> extends TrueNasApiClient<V> {
  /**
   * Create v25.10-specific operation mappings
   *
   * virt.instance.* APIs return boolean (true) but emit job events via websocket.
   * We use callAndGetJobId to capture the job ID, then track the job.
   * All operations emit Job updates until the operation completes.
   *
   * These stay on the unsafe escape hatches even though this client is now
   * version-pinned, because `virt.instance.*` is ABSENT FROM THE GENERATED
   * TYPES ENTIRELY — for every version, not just v26. The middleware
   * `--dump-api` dump describes historical API versions as the *dumping
   * codebase* implements them, and the `virt` plugin was replaced by
   * `container` before the dump was taken, so its methods vanished
   * retroactively from v25.04/v25.10 too. Real v25.10 servers do serve them.
   *
   * Regenerating from a v25.10-era middleware would restore them; until the
   * dump source is pinned per released version, hand-written types are the
   * only source for this operation set.
   */
  protected createOperations(): OperationMappings {
    return {
      containerQuery: () =>
        this.api
          .callUnsafe<VirtualInstanceQuery[]>(
            TrueNasEndpoint.VirtualInstanceQuery,
            [[['type', '=', VirtualInstanceType.Container]]]
          )
          .pipe(map(instances => instances.map(this.toContainer))),

      containerStart: (id: string) =>
        this.api
          .callAndGetJobIdUnsafe(TrueNasEndpoint.VirtualInstanceStart, [id])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),

      containerStop: (id, options) =>
        this.api
          .callAndGetJobIdUnsafe(TrueNasEndpoint.VirtualInstanceStop, [
            id,
            options,
          ])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),

      containerRestart: (id, options) =>
        this.api
          .callAndGetJobIdUnsafe(TrueNasEndpoint.VirtualInstanceRestart, [
            id,
            options,
          ])
          .pipe(switchMap(jobId => this.api.trackJob(jobId))),
    };
  }

  /**
   * Transform VirtualInstanceQuery to unified Container type
   */
  private toContainer(instance: VirtualInstanceQuery): Container {
    return {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      autostart: instance.autostart,
      cpu: instance.cpu,
      memory: instance.memory,
      image: instance.image,
    };
  }
}
