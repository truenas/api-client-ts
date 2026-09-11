/**
 * Test doubles for `@truenas/api-client`.
 *
 * ```typescript
 * import { createFakeClient } from '@truenas/api-client/testing';
 * ```
 *
 * A subpath, so nothing here can reach a production bundle by accident: a
 * consumer that never imports `@truenas/api-client/testing` never sees a byte
 * of it.
 *
 * The doubles are subclasses of the real collaborators rather than objects cast
 * into shape, so a fake client is a real `TrueNasApiClient` running its real
 * `TrueNasApi` over a connection that happens not to have a socket. Both
 * entries are built with code splitting, so they share one copy of those
 * classes and a fake client really is an instance of the exported one —
 * `scripts/check-dist.mjs` fails the build if that stops being true.
 *
 * **This is public surface.** A breaking change here breaks consumers' suites,
 * which is not less disruptive for being test-only, so it moves under the same
 * semver rules as the main entry and the surface is kept deliberately small.
 * Every helper is a commitment.
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
export { fakeApiError } from './fake-api-error';
export type { FakeApiErrorOverrides, TrueNasErrorData } from './fake-api-error';
export { fakeApiVersion } from './fake-api-version';
export { fakeAuthResponse } from './fake-auth-response';
export type { FakeAuthResponseOverrides } from './fake-auth-response';
