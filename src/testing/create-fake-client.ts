import { clientClassFor, type DerivedDirectory } from '@/factory';
import type { TrueNasApiClient } from '@/client/truenas-api-client';
import { SUPPORTED_API_VERSIONS } from '@/generated';
import type { SupportedApiVersion } from '@/generated';
import type { ApiDirectoryShape } from '@/types/api-directory.type';
import type { OperationMappings } from '@/types/operation-mappings.interface';
import { parseApiVersion } from '@/utils/api-version.utils';
import { FakeAuthenticator } from './fake-authenticator';
import { FakeConnection } from './fake-connection';
import { createMockAnswers, type MockAnswers } from './mock-answers';

/**
 * The concrete client classes, as a constructor this module can extend.
 *
 * `clientClassFor` is declared as returning the abstract base, so extending it
 * directly asks TypeScript to implement `createOperations` here — which would
 * mean writing a second copy of the operations the version's own class already
 * has. Every value in that map is one of those concrete classes.
 */
type FakeableClientConstructor = new (
  // A mixin base must take a single `any[]` rest parameter; the real arguments
  // are applied at the one construction site below, where they are checked.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => TrueNasApiClient & { createOperations(): OperationMappings };

/** A real client whose collaborators are the fakes, so a test can drive them. */
export type FakeTrueNasClient<D extends ApiDirectoryShape> = TrueNasApiClient<D> & {
  readonly connection: FakeConnection;
  readonly authenticator: FakeAuthenticator;
  /** Scripted answers, typed by this client's directory. */
  readonly mock: MockAnswers<D>;
};

/** How a fake client is set up. Every field has a usable default. */
export interface FakeClientOptions<V extends SupportedApiVersion> {
  /** Selects both the client class and the directory the result is typed against. */
  version?: V;
  /**
   * Whether the client starts authenticated. Defaults to `true`.
   *
   * Not because delivery depends on it — `events()` and the job stream filter
   * the message, not the auth state, so a `receive` arrives either way — but
   * because the client only *sends* its `core.subscribe` frames once
   * `authenticated$` is true. A fake that starts unauthenticated has an empty
   * `sent` where a real one would have registered its subscriptions, and a
   * spec asserting on the wire sees a client that never subscribed.
   */
  authenticated?: boolean;
  /** Whether the connection starts opened. Defaults to `true`. */
  opened?: boolean;
  /**
   * Whether a call nothing is scripted to answer fails with
   * {@link UnmockedCallError} instead of hanging. Defaults to `false`.
   *
   * A spec that scripts every call with `mock` can turn this on and find out
   * which one it missed, by name, instead of watching a promise never settle.
   * A spec that answers frames by hand with `connection.reply` cannot: the
   * answer is registered after the frame goes out, and there is no way to tell
   * that apart from a frame nobody will ever answer. See
   * {@link FakeConnectionOptions.strict}.
   */
  strict?: boolean;
}

/**
 * Substitutes the fakes into a concrete client class. A mixin over a type
 * parameter so the concrete class comes through as itself (see
 * `FakeableClientConstructor`).
 *
 * The fakes are built in the hooks, not as fields: the base constructor calls
 * the hooks before subclass fields are assigned. `declare` narrows the
 * properties without emitting an assignment that would clobber them.
 */
function withFakeCollaborators<T extends FakeableClientConstructor>(
  Base: T,
  options: { opened?: boolean; strict?: boolean }
) {
  return class FakeClient extends Base {
    declare readonly connection: FakeConnection;

    declare readonly authenticator: FakeAuthenticator;

    protected override createConnection(): FakeConnection {
      return new FakeConnection({
        uuid: this.uuid,
        websocketPath: this.version.websocketPath,
        opened: options.opened ?? true,
        strict: options.strict ?? false,
      });
    }

    protected override createAuthenticator(): FakeAuthenticator {
      return new FakeAuthenticator(this.connection, this.version);
    }
  };
}

/**
 * A real `TrueNasApiClient` with no socket or version discovery: only the
 * connection and authenticator are fakes, so the real dispatch runs.
 *
 * ```typescript
 * const client = createFakeClient({ version: 'v27.0.0' });
 * client.mock.call('system.info', { hostname: 'truenas.local' });
 * client.api.call('system.info').subscribe(info => …);
 *
 * // Instead of `mock.call`, a spec can answer the sent frame by hand:
 * client.connection.reply('system.info', { hostname: 'truenas.local' });
 * ```
 */
export function createFakeClient<V extends SupportedApiVersion = SupportedApiVersion>(
  options: FakeClientOptions<V> = {}
): FakeTrueNasClient<DerivedDirectory<V>> {
  // The oldest supported version, taken from the list rather than written out,
  // for the same reason the directory type comes from the factory's own
  // `DerivedDirectory`: one statement of the default, not two.
  const versionString = options.version ?? SUPPORTED_API_VERSIONS[0];
  const version = parseApiVersion(versionString);
  if (!version) {
    throw new Error(`'${versionString}' is not a version this package parses.`);
  }

  const Base = clientClassFor(version) as FakeableClientConstructor | undefined;
  if (!Base) {
    throw new Error(
      `No client implementation for '${versionString}'. The real factory ` +
        `would have refused it too.`
    );
  }

  const FakeClient = withFakeCollaborators(Base, options);

  const client = new FakeClient(
    // Deliberately not `FakeConnection`'s own placeholder: if the two defaults
    // matched, a test asserting the connection was told which appliance it
    // stands for would pass whether or not it was told.
    'fake-client-uuid',
    ['fake.local'],
    version,
    // Never enabled: the connection this client builds is a fake and opens
    // nothing, and leaving the gate shut keeps that true if it ever stops
    // being one.
    false
  );

  if (options.authenticated ?? true) {
    // Raised directly rather than by logging in, so no credentials are stored
    // and the authenticator's auto-relogin does not fire for it. A spec about
    // reconnection should log in through the authenticator instead, which is
    // what writes them.
    client.authenticator.authenticated$.next(true);
  }

  const fake = client as unknown as FakeTrueNasClient<DerivedDirectory<V>>;

  // Assigned rather than constructed with the client: it needs the connection,
  // which the base constructor builds, and the client's type is only settled
  // once. `mock` is the fake's own member, so widening the readonly here is
  // the definition rather than a mutation of the class's contract.
  (fake as { mock: MockAnswers<DerivedDirectory<V>> }).mock = createMockAnswers(
    client.connection
  );

  return fake;
}
