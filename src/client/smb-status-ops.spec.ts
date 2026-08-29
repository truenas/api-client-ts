import { firstValueFrom, of, type Observable } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type * as publicApi from '@/index';
import type { DefaultApiDirectory } from '@/factory';
import type { ApiDirectoryV25_10_0, ApiDirectoryV26_0_0 } from '@/generated';
import type { Logger } from '@/logger';
import type { CallMethod } from '@/types/api-directory.type';
import type { ApiVersion } from '@/types/api-version.type';
import type {
  SmbStatusInfoLevel,
  SmbStatusOptions,
  SmbStatusRequest,
  SmbStatusResponse,
  SmbStatusRow,
} from '@/types/smb-status.type';
import { TrueNasApiClient } from './truenas-api-client';
import { TrueNasApiClientV2510 } from './truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from './truenas-api-client-v26';
import { TrueNasApiClientV27 } from './truenas-api-client-v27';

/**
 * Cross-version tests for `ops.smbStatus`.
 *
 * This is the only coverage `smbStatus` has — the three per-client specs do not
 * mention it, and the only other reference in the suite is a `vi.fn()` stub in
 * `truenas-api-client.spec.ts`. Everything is tested here, across the versions
 * together, because the claim the operation is *built* on is one no single
 * client can be asked to demonstrate: that the private v25.10 method and the
 * public v26+ one are invoked identically. If that stops being true the
 * operation is no longer one operation, it is two that share a name.
 */

const versions = {
  v25_10: {
    version: 'v25.10.0',
    year: 25,
    minor: 10,
    patch: 0,
    websocketPath: '/api/v25.10.0',
  },
  v26: {
    version: 'v26.0.0',
    year: 26,
    minor: 0,
    patch: 0,
    websocketPath: '/api/v26.0.0',
  },
  v27: {
    version: 'v27.0.0',
    year: 27,
    minor: 0,
    patch: 0,
    websocketPath: '/api/v27.0.0',
  },
} satisfies Record<string, ApiVersion>;

function fakeLogger(): Logger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

interface Leg {
  name: string;
  client: TrueNasApiClient<never>;
  logger: Logger;
}

describe('ops.smbStatus across versions', () => {
  let legs: Leg[];

  beforeEach(() => {
    legs = [
      { name: 'v25.10', ctor: TrueNasApiClientV2510, version: versions.v25_10 },
      { name: 'v26', ctor: TrueNasApiClientV26, version: versions.v26 },
      { name: 'v27', ctor: TrueNasApiClientV27, version: versions.v27 },
    ].map(({ name, ctor, version }) => {
      const logger = fakeLogger();
      return {
        name,
        logger,
        client: new ctor(
          'uuid',
          ['h.local'],
          version,
          false,
          undefined,
          logger
        ) as unknown as TrueNasApiClient<never>,
      };
    });
  });

  afterEach(() => legs.forEach((leg) => leg.client.close()));

  /** Invoke `smbStatus` on one leg and report what reached the wire. */
  async function invoke(
    leg: Leg,
    request?: SmbStatusRequest,
    response: SmbStatusResponse = []
  ): Promise<{ method: unknown; params: unknown }> {
    const spy = vi
      .spyOn(leg.client.api, 'call')
      .mockReturnValue(of(response) as never);

    await firstValueFrom(leg.client.ops.smbStatus(request));

    expect(spy).toHaveBeenCalledTimes(1);
    const [method, params] = spy.mock.calls[0];
    return { method, params };
  }

  // The guard against this file silently testing nothing: `it.each([])`
  // registers zero tests and reports success, and a `legs` that came out empty
  // would do the same to every loop below.
  it('covers all three version clients', () => {
    expect(legs.map((leg) => leg.name)).toEqual(['v25.10', 'v26', 'v27']);
  });

  it('calls the same method name on every version', async () => {
    for (const leg of legs) {
      const { method } = await invoke(leg);
      expect(method, leg.name).toBe('smb.status');
    }
  });

  /**
   * Asserted against a written-out literal rather than by comparing the legs to
   * each other. All three build the payload through `toSmbStatusParams`, so a
   * leg-to-leg comparison is nearly tautological — it would keep passing if the
   * shared builder itself changed shape. The literal is what pins the bytes.
   */
  it('sends the identical wire payload on every version', async () => {
    const request: SmbStatusRequest = {
      infoLevel: 'SESSIONS',
      filters: [['uid', '=', 1000]],
      options: { count: true },
      statusOptions: { fast: true },
    };
    const expected = [
      'SESSIONS',
      [['uid', '=', 1000]],
      { count: true },
      { fast: true },
    ];

    for (const leg of legs) {
      const { params } = await invoke(leg, request);
      expect(params, leg.name).toEqual(expected);
    }
  });

  it('sends the identical defaulted payload on every version', async () => {
    for (const leg of legs) {
      const { params } = await invoke(leg);
      expect(params, leg.name).toEqual(['ALL', [], {}, {}]);
    }
  });

  /**
   * Each arm of `list[dict] | dict | int` reaches the caller unchanged. The
   * operation deliberately does not narrow the union or reshape v25.10's answer
   * into anything, so what middleware returned is what arrives.
   */
  it.each([
    { label: 'list', response: [{ session_id: '1' }] as SmbStatusResponse },
    { label: 'dict', response: { session_id: '1' } as SmbStatusResponse },
    { label: 'int', response: 3 as SmbStatusResponse },
  ])('returns the $label arm unchanged on every version', async ({
    response,
  }) => {
    for (const leg of legs) {
      const spy = vi
        .spyOn(leg.client.api, 'call')
        .mockReturnValue(of(response) as never);

      const result = await firstValueFrom(leg.client.ops.smbStatus());

      expect(result, leg.name).toEqual(response);
      spy.mockRestore();
    }
  });

  /**
   * The behaviour the issue asked for by name: the v25.10 leg adds no refusal
   * of its own. A version being papered over would throw here, or hand back a
   * synthesized stand-in; this one passes the server's own rows through.
   *
   * Scoped deliberately. `api.call` is mocked, so this says nothing about
   * whether a given session is *allowed* to call the private method — a
   * role-scoped or STIG session is refused by middleware with `EACCES`, which
   * is documented on `OperationMappings.smbStatus` and is not something this
   * client decides or could assert here.
   */
  it('adds no refusal of its own on v25.10 — the server answer passes through', async () => {
    const rows = [{ session_id: '1', username: 'bob' }];
    vi.spyOn(legs[0].client.api, 'call').mockReturnValue(of(rows) as never);

    await expect(
      firstValueFrom(legs[0].client.ops.smbStatus({ infoLevel: 'SESSIONS' }))
    ).resolves.toEqual(rows);
  });

  it('reports the private call on v25.10 and nowhere else', async () => {
    for (const leg of legs) {
      await invoke(leg);
    }

    const [v2510, v26, v27] = legs;
    expect(v2510.logger.debug).toHaveBeenCalledOnce();
    expect(vi.mocked(v2510.logger.debug).mock.calls[0][0]).toContain(
      'private on v25.10'
    );

    // Nothing is degraded, so nothing warns — on any version.
    for (const leg of legs) {
      expect(leg.logger.warn, leg.name).not.toHaveBeenCalled();
      expect(leg.logger.error, leg.name).not.toHaveBeenCalled();
    }

    // v26+ is an ordinary public call and says nothing at all.
    expect(v26.logger.debug).not.toHaveBeenCalled();
    expect(v27.logger.debug).not.toHaveBeenCalled();
  });

  /**
   * The client-count recipe from the issue, end to end. It is documented as a
   * composition of this one operation, so it must work through the public
   * `ops` surface with no special-casing anywhere.
   */
  it('serves the client-count recipe on every version', async () => {
    for (const leg of legs) {
      const spy = vi
        .spyOn(leg.client.api, 'call')
        .mockReturnValue(of(7) as never);

      const count = await firstValueFrom(
        leg.client.ops.smbStatus({
          infoLevel: 'SESSIONS',
          options: { count: true },
          statusOptions: { fast: true },
        })
      );

      expect(spy).toHaveBeenCalledWith('smb.status', [
        'SESSIONS',
        [],
        { count: true },
        { fast: true },
      ]);
      expect(count, leg.name).toBe(7);
      spy.mockRestore();
    }
  });
});

/**
 * Type-level tests. These are enforced by `tsc -p tsconfig.spec.json`, not by
 * `vitest run` — `expectTypeOf` compiles to nothing, so the bodies below are
 * runtime no-ops and would "pass" with every assertion wrong. `yarn typecheck`
 * is what runs them.
 */
describe('ops.smbStatus is reachable without pinning a version', () => {
  /**
   * The requirement this operation exists to satisfy: a consumer that let
   * discovery choose the version gets `TrueNasApiClient<DefaultApiDirectory>`,
   * and `smbStatus` has to typecheck there.
   *
   * It does because `ops` is declared `OperationMappings` flat, rather than
   * parameterized by the directory generic — so the operation surface does not
   * narrow with the version. Parameterizing it would break this.
   */
  it('typechecks on an unpinned discovery client', () => {
    expectTypeOf<TrueNasApiClient<DefaultApiDirectory>['ops']['smbStatus']>()
      .toEqualTypeOf<
        (request?: SmbStatusRequest) => Observable<SmbStatusResponse>
      >();
  });

  /**
   * What makes the assertion above worth making. The unpinned default is the
   * v25.10 surface — the one version whose dump has no `smb.status` in it — so
   * if `ops` ever stopped being flat, this is the client that would break.
   */
  it('resolves the unpinned default to the v25.10 surface', () => {
    expectTypeOf<DefaultApiDirectory>().toEqualTypeOf<ApiDirectoryV25_10_0>();
  });

  /**
   * The premise the whole operation rests on, stated as a type. `smb.status` is
   * not a callable method of the v25.10 directory and is one of v26's, which is
   * why the v25.10 leg needs an assertion and the v26 leg does not.
   *
   * If `smb.status` ever appears in the v25.10 directory the first of these
   * fails, and that is the signal to delete `PrivateSmbStatusCall` and the cast
   * with it. Note what could cause that, though: every file in
   * `src/generated/v25_10_0/` carries the `FROZEN` marker and the generator
   * skips it, so a regeneration cannot put it there. Only an unfreeze or a
   * deliberate hand edit can — which is to say this guard watches a maintainer,
   * not the generator.
   */
  it('has smb.status on v26 and not on v25.10', () => {
    expectTypeOf<'smb.status'>().not.toExtend<
      CallMethod<ApiDirectoryV25_10_0>
    >();
    expectTypeOf<'smb.status'>().toExtend<CallMethod<ApiDirectoryV26_0_0>>();
  });
  /**
   * The barrel is part of the contract, and nothing else pins it.
   *
   * `index.spec.ts` enumerates *runtime* exports; these five are type-only, so
   * dropping one from `src/index.ts` is a breaking change that the whole suite
   * would pass through silently. Reading them back off `@/index` is what makes
   * that a compile error.
   *
   * `SmbStatusParams` is deliberately absent. It is the positional wire tuple,
   * built internally and accepted by nothing on this surface, so it is not part
   * of the contract and must not be added to this list to make it symmetrical.
   */
  it('exports the shapes the operation speaks in', () => {
    expectTypeOf<publicApi.SmbStatusRequest>().toEqualTypeOf<SmbStatusRequest>();
    expectTypeOf<publicApi.SmbStatusResponse>().toEqualTypeOf<SmbStatusResponse>();
    expectTypeOf<publicApi.SmbStatusRow>().toEqualTypeOf<SmbStatusRow>();
    expectTypeOf<publicApi.SmbStatusOptions>().toEqualTypeOf<SmbStatusOptions>();
    expectTypeOf<publicApi.SmbStatusInfoLevel>().toEqualTypeOf<SmbStatusInfoLevel>();
  });
});
