/**
 * The `virt.*` namespace exists only as hand-maintained entries in
 * `src/generated/v25_10_0/`, because no dump can produce it: middleware removed
 * those models from every version directory in `b9c330ee94`, master included,
 * so a regeneration would delete them rather than restore them.
 *
 * These tests are the guard on that. They are type-level — the `it` bodies exist
 * so the file is picked up by `tsconfig.spec.json` — plus one runtime check that
 * the generator cannot reach back into the frozen versions.
 */
import { readFileSync } from 'node:fs';
import type { Observable } from 'rxjs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import type {
  ApiCallDirectoryV25_10_0,
  ApiCallDirectoryV26_0_0,
  ApiEventDirectoryV26_0_0,
  v25_10_0,
} from '@/generated';
import type { QueryDirectory, QueryMethod } from '@/types/query.type';

type Dir = ApiCallDirectoryV25_10_0;
type InstanceEntry = v25_10_0.VirtInstanceEntry;

const api = { query: () => undefined } as unknown as TrueNasApi<Dir>;

describe('virt.* on the v25.10 directory', () => {
  it('reaches the instance and volume surfaces', () => {
    expectTypeOf(api.query('virt.instance.query')).toEqualTypeOf<
      Observable<InstanceEntry[]>
    >();
    expectTypeOf(api.query('virt.volume.query')).toEqualTypeOf<
      Observable<v25_10_0.VirtVolumeEntry[]>
    >();

    // Marked as queries, so the verbs apply and filters are checked.
    expectTypeOf<'virt.instance.query'>().toExtend<QueryMethod<Dir>>();
    expectTypeOf<'virt.volume.query'>().toExtend<QueryMethod<Dir>>();
  });

  it('carries the entity fields rather than an opaque record', () => {
    // The whole point: `Record<string, unknown>` would make every one of these
    // assertions pass vacuously, and would silently accept a bogus filter field.
    expectTypeOf<InstanceEntry['id']>().toEqualTypeOf<string>();
    expectTypeOf<InstanceEntry['type']>().toEqualTypeOf<'CONTAINER' | 'VM'>();
    expectTypeOf<InstanceEntry['storage_pool']>().toEqualTypeOf<string>();

    api.query('virt.instance.query', [['type', '=', 'CONTAINER']]);
    // @ts-expect-error not a field of VirtInstanceEntry
    api.query('virt.instance.query', [['not_a_field', '=', 1]]);
  });

  /**
   * `virt.device.import_disk_image` and `export_disk_image` are the two the
   * obvious reconstruction route would have lost — master deleted
   * `plugins/virt/disk.py` in `2a51701530`, two months before it deleted the
   * rest of virt, so restoring the pre-deletion tree would have silently
   * dropped them. Named individually because a count would not have noticed.
   */
  it('includes the jobs that a master-based reconstruction would have missed', () => {
    expectTypeOf<'virt.device.import_disk_image'>().toExtend<
      keyof v25_10_0.ApiJobDirectory
    >();
    expectTypeOf<'virt.device.export_disk_image'>().toExtend<
      keyof v25_10_0.ApiJobDirectory
    >();
  });

  /**
   * `virt.instance.metrics` is an event *source* rather than a CRUD event, so
   * it takes subscription params. It was missed in the first pass — the two
   * models were transcribed and the directory entry was not, which nothing
   * caught because the tests only pinned `virt.instance.query`. Both event
   * kinds are asserted now.
   */
  it('carries both event kinds', () => {
    type Events = v25_10_0.ApiEventDirectory;

    expectTypeOf<Events['virt.instance.query']['added']>().toEqualTypeOf<
      v25_10_0.VirtInstanceAddedEvent
    >();
    expectTypeOf<
      Events['virt.instance.metrics']['subscriptionParams']
    >().toEqualTypeOf<v25_10_0.VirtInstancesMetricsEventSourceArgs>();
  });

  it('does not leak into versions that never had it', () => {
    // v26 dropped virt for container.*; the shared base is the intersection of
    // every version, so virt must not appear in either.
    type V26Method = keyof ApiCallDirectoryV26_0_0;
    type V26Event = keyof ApiEventDirectoryV26_0_0;
    expectTypeOf<'virt.instance.query'>().not.toExtend<V26Method>();
    expectTypeOf<'virt.instance.query'>().not.toExtend<QueryMethod<QueryDirectory>>();
    expectTypeOf<'virt.instance.metrics'>().not.toExtend<V26Event>();
  });
});

describe('the freeze that keeps virt.* alive', () => {
  /**
   * Hand-maintained entries in a generated directory survive only while nothing
   * regenerates it. `--min-version` is what enforces that, so it is worth a test
   * rather than a comment — this is the single line whose reversion would delete
   * the work above with no other symptom.
   */
  it('pins generation to v26.0.0 and upward', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['generate:api']).toContain('--min-version v26.0.0');
    expect(pkg.scripts['generate:api']).not.toContain('v25.10');
  });
});
