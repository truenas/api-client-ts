/**
 * Test doubles for `@truenas/api-client`.
 *
 * Not exported from the package yet — this is the first slice of the testing
 * entry, and the subpath export lands with the packaging work once the surface
 * has proved itself against this repo's own specs.
 *
 * The doubles are subclasses of the real collaborators rather than objects cast
 * into shape, so a fake client is a real `TrueNasApiClient` running its real
 * `TrueNasApi` over a connection that happens not to have a socket.
 */
export { FakeConnection } from './fake-connection';
export type { FakeConnectionOptions } from './fake-connection';
export { FakeAuthenticator } from './fake-authenticator';
export type { RecordedLogin } from './fake-authenticator';
export { createFakeClient } from './create-fake-client';
export type { FakeClientOptions, FakeTrueNasClient } from './create-fake-client';
