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

import { map, Observable } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type { ApiDirectoryV25_10_0, v25_10_0 } from '@/generated';
import { Container } from '@/types/container.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import type {
  SmbStatusParams,
  SmbStatusResponse,
} from '@/types/smb-status.type';
import { toAppState } from '@/utils/app-state.utils';
import { toSmbStatusParams } from '@/utils/smb-status.utils';

/**
 * The one method this client invokes that its generated directory does not
 * describe.
 *
 * `smb.status` exists on v25.10 under this exact name, taking these exact four
 * positional arguments and returning this exact union — middleware declares it
 * in `plugins/smb_/status.py` and has since the series shipped. What it does
 * not do is *advertise* it: the method is decorated `private=True`, and
 * `middlewared --dump-api` omits private methods, so nothing in
 * `@/generated/v25_10_0` mentions it and `api.call('smb.status', …)` does not
 * typecheck against `ApiDirectoryV25_10_0`.
 *
 * So the existence of the method is asserted here rather than derived, and the
 * assertion is checked against middleware source instead of the dump. That is
 * the whole reason this type exists, and the reason it is written as narrowly
 * as it is: it admits one method name, one argument tuple and one return type,
 * so it cannot be reused to reach anything else, and a future version that
 * changes any of the three is a change to this declaration rather than a silent
 * mismatch. It is deliberately not a general "call an undeclared method"
 * escape — one was considered and rejected, because `client.api` is public and
 * such a method would become a supported way for consumers to route around the
 * directory entirely.
 *
 * The corresponding v26+ leg needs none of this: the method is public there and
 * comes out of the directory like any other.
 */
type PrivateSmbStatusCall = {
  call(
    method: 'smb.status',
    params: SmbStatusParams
  ): Observable<SmbStatusResponse>;
};

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
 *
 * SMB operations:
 * - smbStatus → smb.status, which is declared `private=True` on this version
 *   and so is absent from the generated directory. See `PrivateSmbStatusCall`
 *   for how it is reached and why that is a cast, and `OperationMappings` for
 *   the authorization difference being private carries with it here.
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

      // The private leg. See `PrivateSmbStatusCall` for why this is a cast and
      // not a directory lookup.
      //
      // v25.10 answers rather than refusing, for a caller with the authority.
      // Being private does not stop the method running: `ws_handler/rpc.py`
      // logs a warning for a private call over websocket and dispatches it
      // anyway — the `# FIXME: Eventually, prohibit this` above that branch is
      // still unresolved on master.
      //
      // It does decide who may run it. `smb.status` carries no `roles=` here,
      // and middleware role-registers a method only `if roles:`, so it is in no
      // role's allowlist and only the non-STIG full-admin wildcard reaches it.
      // That is documented on `OperationMappings.smbStatus`; this leg does not
      // pre-empt it. A caller without the authority gets middleware's `EACCES`,
      // which is the honest answer and the server's to give.
      //
      // The server-side warning is per dispatch, and a client count is exactly
      // the sort of thing a caller polls. Reported at debug rather than warn,
      // because nothing here is degraded or unhonoured — the request is served
      // in full — and left to the caller to weigh.
      //
      // Future tense, and for the same reason as `containerDelete` above: this
      // runs when the operation is built, and `api.call` is cold, so no request
      // has gone out yet and may never. One built observable subscribed twice
      // dispatches twice; this line is what will happen, not a record that it
      // did.
      smbStatus: (request) => {
        this.logger.debug(
          'smbStatus: smb.status is private on v25.10; each dispatch will ' +
            'log a warning server-side and needs a non-STIG full-admin session',
          { method: 'smb.status', infoLevel: request?.infoLevel ?? 'ALL' }
        );
        return (this.api as unknown as PrivateSmbStatusCall).call(
          'smb.status',
          toSmbStatusParams(request)
        );
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
