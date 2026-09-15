/**
 * Test doubles for `@truenas/api-client`, from
 * `@truenas/api-client/testing` — a subpath, so a consumer that never imports
 * it never sees a byte of it.
 *
 * The doubles subclass the real collaborators rather than being cast into
 * shape, so a fake client is a real `TrueNasApiClient` over a socketless
 * connection. Both entries are code-split and share one copy of those
 * classes; `scripts/check-dist.mjs` fails the build if that stops being true.
 *
 * **Public surface**, under the same semver rules as the main entry: a break
 * here breaks consumers' suites. Every helper is a commitment.
 *
 * @module @truenas/api-client/testing
 */
export { FakeConnection } from './fake-connection';
export type { FakeConnectionOptions } from './fake-connection';
export { FakeAuthenticator } from './fake-authenticator';
export type { RecordedLogin } from './fake-authenticator';
export { createFakeClient } from './create-fake-client';
export type { FakeClientOptions, FakeTrueNasClient } from './create-fake-client';
export type { MockAnswers, JobUpdate } from './mock-answers';
export { UnmockedCallError } from './unmocked-call-error';
export { withSpies } from './with-spies';
export type { SpyFactory, SpyableClient } from './with-spies';
export { fakeJob } from './fake-job';
export type { FakeJobOverrides } from './fake-job';
// Re-exported here too: `fakeApiError` returns one and `replyError` takes
// one, so a spec writing a typed helper around either needs the name from
// the entry it is already importing.
export type { TrueNasErrorData, TrueNasErrorFrame } from '@/types/api-error.type';
export { fakeApiError } from './fake-api-error';
export type { FakeApiErrorOverrides } from './fake-api-error';
export { fakeApiVersion } from './fake-api-version';
export type { FakeApiVersionOverrides } from './fake-api-version';
export { fakeAuthResponse } from './fake-auth-response';
export type { FakeAuthResponseOverrides } from './fake-auth-response';
// Same reason as the error types above: every arm but the default of
// `fakeAuthResponse` and `failNextLogin` is named through this enum.
export { AuthResponseType } from '@/types/auth.type';
