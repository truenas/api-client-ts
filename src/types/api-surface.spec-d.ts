/**
 * Compile-time tests for the version-agnostic API surface.
 *
 * These verify the central promise of the generated-types integration: API
 * misuse that used to fail silently at runtime is now a compile error. The
 * negative cases use `@ts-expect-error`, so if a case ever STOPS being an
 * error, the stale directive itself fails `yarn typecheck`.
 *
 * This file is type-checked (tsconfig.spec.json) but never executed.
 */
import { Observable } from 'rxjs';
import { expectTypeOf } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import type { v25_10_0, v26_0_0 } from '@/generated';
import type {
  ApiCallMethod,
  ApiJobMethod,
  ClientSupportedVersion,
} from '@/types/api-surface.type';

declare const api: TrueNasApi;

// ── Supported range ──────────────────────────────────────────────────────────
// Derived from apiVersionConfig MIN/MAX over the generated version list.
expectTypeOf<ClientSupportedVersion>().toEqualTypeOf<
  | 'v25.10.0'
  | 'v25.10.1'
  | 'v25.10.2'
  | 'v25.10.3'
  | 'v25.10.4'
  | 'v25.10.5'
  | 'v26.0.0'
>();

// ── Method-name checking ─────────────────────────────────────────────────────
// Methods present on every supported version are callable…
expectTypeOf<'alert.list'>().toExtend<ApiCallMethod>();
expectTypeOf<'core.ping'>().toExtend<ApiCallMethod>();

// …typos are compile errors…
// @ts-expect-error unknown method name
api.call('alert.lst');

// …and version-specific methods are excluded from the version-agnostic
// surface: introduced mid-range (v26+)…
expectTypeOf<'api_key.convert_raw_key'>().not.toExtend<ApiCallMethod>();
// @ts-expect-error container.query exists only on v26+ — narrow or use callUnsafe
api.call('container.query', [[]]);

// …or removed mid-range (v25.10-only).
expectTypeOf<'virt.instance.query'>().not.toExtend<ApiCallMethod>();
expectTypeOf<'virt.instance.start'>().not.toExtend<ApiJobMethod>();

// ── Params checking ──────────────────────────────────────────────────────────
api.call('alert.dismiss', ['uuid-1']);

// @ts-expect-error alert.dismiss requires a uuid argument
api.call('alert.dismiss', []);

// @ts-expect-error alert.dismiss takes a string uuid, not a number
api.call('alert.dismiss', [42]);

// ── Response typing ──────────────────────────────────────────────────────────
expectTypeOf(api.call('core.ping')).toEqualTypeOf<Observable<'pong'>>();

// A method whose response shape changed within the supported range yields the
// honest union: the connection could be speaking either version.
expectTypeOf(api.call('alert.list')).toEqualTypeOf<
  Observable<v25_10_0.Alert[] | v26_0_0.Alert[]>
>();

// ── Call/job partition ───────────────────────────────────────────────────────
// Long-running jobs are not plain calls; the compiler steers to callAndGetJobId.
expectTypeOf<'app.upgrade'>().toExtend<ApiJobMethod>();
expectTypeOf<'app.upgrade'>().not.toExtend<ApiCallMethod>();
api.callAndGetJobId('app.upgrade', ['my-app']);

// @ts-expect-error app.upgrade is a job — use callAndGetJobId
api.call('app.upgrade', ['my-app']);

// ── TrueNasEndpoint enum compatibility ───────────────────────────────────────
// String-enum members are assignable to their literal values, so existing
// enum-keyed call sites keep working against the generated directories.
expectTypeOf<TrueNasEndpoint.AlertList>().toExtend<ApiCallMethod>();
api.call(TrueNasEndpoint.PoolQuery);
api.callAndGetJobId(TrueNasEndpoint.AppUpgrade, ['my-app']);

// Job-kind enum members are correctly rejected by call():
expectTypeOf<TrueNasEndpoint.AppStart>().not.toExtend<ApiCallMethod>();
