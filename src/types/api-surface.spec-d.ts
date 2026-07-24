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
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { UserRole } from '@/enums/user-role.enum';
import type { AnyTrueNasApiClient } from '@/factory';
import { isAuthSuccess } from '@/types/auth.type';
import type {
  AuthLoginParams,
  AuthResponse,
  AuthResponseType,
} from '@/types/auth.type';
import type { v25_10_0, v26_0_0 } from '@/generated';
import type {
  ApiCallMethod,
  ApiEventName,
  ApiEventUpdate,
  ApiJobMethod,
  ApiJobResponse,
  ClientSupportedVersion,
} from '@/types/api-surface.type';
import type { Job } from '@/types/job.type';

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

// ── Typed job results (phase 2) ──────────────────────────────────────────────
// job() composes callAndGetJobId + trackJob and types the job's result from
// the generated job directory.
expectTypeOf(api.job('boot.scrub')).toEqualTypeOf<Observable<Job<null>>>();

// A job whose result shape changed within the supported range yields the
// honest union of both versions' shapes.
expectTypeOf<ApiJobResponse<'pool.create'>>().toEqualTypeOf<
  v25_10_0.PoolEntry | v26_0_0.PoolEntry
>();

// trackJob's result type is caller-asserted (a bare job id has no method
// info); the default stays unknown.
expectTypeOf(api.trackJob(42)).toEqualTypeOf<Observable<Job<unknown>>>();

// @ts-expect-error pool.create requires a data argument
api.job('pool.create', []);

// ── Typed events (phase 2) ───────────────────────────────────────────────────
expectTypeOf<'alert.list'>().toExtend<ApiEventName>();
expectTypeOf<'core.get_jobs'>().toExtend<ApiEventName>();

// @ts-expect-error unknown event name
api.events('alert.lst');

// Payloads are a discriminated union over the notification kind, and
// payload-less kinds (`removed` — filtered out at runtime) are excluded.
declare const alertEvent: ApiEventUpdate<'alert.list'>;
expectTypeOf(alertEvent.msg).toEqualTypeOf<'added' | 'changed'>();
if (alertEvent.msg === 'changed') {
  expectTypeOf(alertEvent.fields).toEqualTypeOf<
    v25_10_0.Alert | v26_0_0.Alert
  >();
}

// ── Version-pinned clients (phase 3) ─────────────────────────────────────────
declare const v2510: TrueNasApiClientV2510;
declare const v26: TrueNasApiClientV26;

// A v26-only method is available on the v26 client…
v26.api.call('api_key.convert_raw_key', ['raw-key']);
// …and rejected on the v25.10 client, which never had it.
// @ts-expect-error api_key.convert_raw_key was introduced in v26.0.0
v2510.api.call('api_key.convert_raw_key', ['raw-key']);

// container.* likewise: v26+ only.
v26.api.call('container.query', [[]]);
// @ts-expect-error container.* was introduced in v26.0.0
v2510.api.call('container.query', [[]]);

// Pinning an exact patch narrows further still: the v25.10 family surface is
// the intersection over its patches, while a pinned patch is exact.
declare const v2510exact: TrueNasApiClientV2510<'v25.10.5'>;
expectTypeOf(v2510exact.version.version).toEqualTypeOf<string>();

// A method the whole range shares is callable on either client with no
// narrowing — this is what keeps version-agnostic call sites working.
v2510.api.call('alert.list');
v26.api.call('alert.list');

// ── supports() narrowing (phase 3) ───────────────────────────────────────────
declare const discovered: AnyTrueNasApiClient;

// Before narrowing, only the common surface is callable.
discovered.api.call('alert.list');
// @ts-expect-error v26-only until narrowed
discovered.api.call('api_key.convert_raw_key', ['raw-key']);

// supports() narrows the union to the members that satisfy the minimum, so
// the v26-only surface becomes callable inside the guard.
if (discovered.supports('v26.0.0')) {
  discovered.api.call('api_key.convert_raw_key', ['raw-key']);
  discovered.api.call('container.query', [[]]);
}

// instanceof remains a valid (family-level) narrowing.
if (discovered instanceof TrueNasApiClientV26) {
  discovered.api.call('api_key.convert_raw_key', ['raw-key']);
}

// ── Auth response narrowing (phase 4b) ───────────────────────────────────────
declare const login: AuthResponse;

// The discriminator covers every variant the supported range can return —
// including SCRAM_RESPONSE and DENIED, which v26 added. Narrowing code must
// handle them because a discovered client may be speaking v26.
expectTypeOf<AuthResponseType>().toEqualTypeOf<
  | 'SUCCESS'
  | 'AUTH_ERR'
  | 'EXPIRED'
  | 'OTP_REQUIRED'
  | 'REDIRECT'
  | 'SCRAM_RESPONSE'
  | 'DENIED'
>();

// @ts-expect-error user_info only exists on the SUCCESS variant
void login.user_info;

// @ts-expect-error urls only exists on the REDIRECT variant
void login.urls;

if (isAuthSuccess(login)) {
  // Narrowed: user_info is available, with the opaque dicts refined.
  expectTypeOf(login.user_info?.privilege.roles.$set).toEqualTypeOf<
    UserRole[] | undefined
  >();
  expectTypeOf(
    login.user_info?.attributes.preferences?.lifetime
  ).toEqualTypeOf<number | undefined>();
}

if (login.response_type === 'REDIRECT') {
  expectTypeOf(login.urls).toEqualTypeOf<string[]>();
  // @ts-expect-error a REDIRECT response carries no user_info
  void login.user_info;
}

// Login payloads are checked against the generated param models.
const goodLogin = [
  { mechanism: 'PASSWORD_PLAIN', username: 'u', password: 'p' },
] satisfies AuthLoginParams;
void goodLogin;

// A payload missing a required field is rejected.
expectTypeOf<
  [{ mechanism: 'PASSWORD_PLAIN'; username: string }]
>().not.toExtend<AuthLoginParams>();

// SCRAM is v26-only, so it is not in the version-agnostic login params: the
// intersection admits only payloads every supported version accepts.
expectTypeOf<{
  mechanism: 'SCRAM_SHA512';
  username: string;
}>().not.toExtend<AuthLoginParams[0]>();
