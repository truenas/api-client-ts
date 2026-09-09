import { afterAll, describe, expect, it } from 'vitest';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { FakeConnection } from './fake-connection';

/**
 * The inventory that ends the guessing.
 *
 * Six review rounds on this class each found one more member of
 * `TrueNasConnection` that the fake left attached to a `connection$` which
 * never emits — values, then transitions, then terminations, then level versus
 * edge semantics. Each was found by someone thinking of the next thing to
 * measure, which is not a method that terminates.
 *
 * So the public surface is enumerated instead, and every member is classified:
 * driven by the fake, or deliberately inert. A member added to
 * `TrueNasConnection` fails this test until someone decides which it is. That
 * is the whole point — the failure is the question being asked.
 */
const DRIVEN = [
  'close',
  'closeConnection',
  'closed',
  'closed$',
  'messages',
  'messages$',
  'opened',
  'opened$',
  'send',
  'systemUuid',
  'websocketPath',
] as const;

/**
 * Inert, and safe to be: nothing in the client reads them for behaviour, and a
 * fake that pretended would be inventing appliance state.
 *
 * `ws` is the sharp one — typed `TrueNasSocket` and never assigned, so it is
 * not even an own property until a socket exists, and
 * `connection.ws.next(…)`, the line the hand-rolled doubles were written
 * around, throws. Frames go in through `receive` and come out through `sent`.
 */
const INERT = [
  'connect',
  'connection$',
  'connectionAttempts',
  'createSocket',
  'enabled$',
  'enabledChange$',
  'hasConnectionError$',
  'hasExhaustedRetries',
  'hostname',
  'hostname$',
  'hostnames',
  'lastErrorMessage',
  'lastErrorMessage$',
  'logger',
  'maxRetry',
  'protocol',
  'retryDelay',
  // Reachable and silently inert: the package's own docs point apps at
  // `setEnabled`, and a fake has no socket to enable. Driving it changes
  // nothing here, which is the one entry on this list a downstream spec might
  // reasonably reach for.
  'setEnabled',
  'systemName',
  'ws',
  'ws$',
] as const;

/**
 * Every member reachable on an instance at runtime, own and inherited.
 *
 * TypeScript's `private` is compile-time only, so the base's internals show up
 * here too. They are listed as inert rather than filtered, because the point of
 * the list is that nothing on the class is unaccounted for.
 *
 * The two halves have complementary blind spots, and one shape falls through
 * both: a `private` or `protected` member that is declared and never assigned
 * is invisible to the walk, because it never becomes an own property, and to
 * `keyof`, which drops non-public members. Nothing on the class today is that
 * shape, and one that appeared would not be a member a consumer could reach.
 */
function publicMembers(instance: object): string[] {
  const seen = new Set<string>();
  for (
    let level: object | null = instance;
    level && level !== Object.prototype;
    level = Object.getPrototypeOf(level) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(level)) {
      if (name !== 'constructor') seen.add(name);
    }
  }
  return [...seen].sort();
}

/**
 * The half the runtime walk cannot do.
 *
 * `ws` is declared `ws!: TrueNasSocket` and never assigned, so it is not an own
 * property of a constructed instance and the walk below cannot see it — the
 * member the `INERT` note calls "the sharp one" was, until this line, the one
 * member the inventory did not classify. Anything else declared that way lands
 * here as a compile error rather than passing unnoticed.
 */
type Unclassified = Exclude<
  keyof TrueNasConnection,
  (typeof DRIVEN)[number] | (typeof INERT)[number]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unclassified: Unclassified extends never ? true : Unclassified = true;

describe('FakeConnection surface', () => {
  const real = new TrueNasConnection(false, [], 'uuid', '/api/current');
  const fake = new FakeConnection();

  it('classifies every public member of the real connection', () => {
    const classified = new Set<string>([...DRIVEN, ...INERT]);
    const unclassified = publicMembers(real).filter(name => !classified.has(name));

    expect(unclassified).toEqual([]);
  });

  it('adds only its own driving methods to that surface', () => {
    const added = publicMembers(fake).filter(
      name => !publicMembers(real).includes(name)
    );

    expect(added.sort()).toEqual([
      'autoReplies',
      'autoReply',
      'frames',
      'idOf',
      'incoming',
      'queued',
      'receive',
      'reply',
      'replyError',
      'sent',
      'simulateClose',
      'simulateOpen',
      'terminated',
      'write',
    ]);
  });

  it('keeps the two classifications disjoint', () => {
    const both = DRIVEN.filter(name => (INERT as readonly string[]).includes(name));

    expect(both).toEqual([]);
  });

  afterAll(() => {
    real.close();
    fake.close();
  });
});
