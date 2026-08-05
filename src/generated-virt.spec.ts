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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Observable } from 'rxjs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import type {
  ApiCallDirectoryV25_10_0,
  ApiCallDirectoryV26_0_0,
  ApiEventDirectoryV26_0_0,
  ApiJobDirectoryV26_0_0,
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
    // Every key, not a chosen few: naming two of thirty-five would pass just as
    // happily after a partial re-application, which is the shape the failure
    // would actually take.
    expectTypeOf<
      Extract<keyof ApiCallDirectoryV26_0_0, `virt.${string}`>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof ApiJobDirectoryV26_0_0, `virt.${string}`>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof ApiEventDirectoryV26_0_0, `virt.${string}`>
    >().toEqualTypeOf<never>();

    expectTypeOf<'virt.instance.query'>().not.toExtend<QueryMethod<QueryDirectory>>();
  });
});

const repoRoot = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the freeze that keeps virt.* alive', () => {
  /**
   * Narrowing `--min-version` past v25.10 would make v26 the chain root: the
   * later versions would stop being deltas against a frozen directory, and
   * v25.10 would drop out of `SUPPORTED_API_VERSIONS` and the package entirely.
   * The freeze is the marker's job; this pins the range it operates over.
   */
  /**
   * The marker is the whole mechanism, and it lives as a literal string in every
   * released file. Strip or mistype one header and that file silently unfreezes;
   * without this, the first symptom is a regeneration having already eaten it.
   */
  it('marks every file in the released 25.10 series', () => {
    const generated = path.join(repoRoot(), 'src/generated');
    const MARKER = 'FROZEN — generated once, then hand-maintained.';
    const filesIn = (dir: string) =>
      readdirSync(path.join(generated, dir))
        .filter((f) => f.endsWith('.ts'))
        .filter((f) => statSync(path.join(generated, dir, f)).isFile());

    // Derived rather than listed: a directory counts as frozen if any of its
    // files says so, which covers a future v26 frozen after release and does
    // not break the day a v25_10_6 lands.
    const versionDirs = readdirSync(generated).filter((d) => /^v\d/.test(d));
    const frozen = versionDirs.filter((d) =>
      filesIn(d).some((f) => readFileSync(path.join(generated, d, f), 'utf8').includes(MARKER))
    );

    expect(frozen).toContain('v25_10_0');
    expect(frozen.length).toBeGreaterThan(0);

    // Every file of a frozen directory, not merely one: a half-marked directory
    // silently unfreezes the files that lost their header.
    for (const dir of frozen) {
      for (const file of filesIn(dir)) {
        expect(
          readFileSync(path.join(generated, dir, file), 'utf8'),
          `${dir}/${file} is missing the frozen marker`
        ).toContain(MARKER);
      }
    }
  });

  it('generates the whole chain, from v25.10.0 upward', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // v25.10.0, not v26: the whole chain must be generated, because later
    // versions are deltas against v25.10 and the root index enumerates every
    // version. The freeze is enforced by the marker, not by narrowing this.
    expect(pkg.scripts['generate:api']).toContain('--min-version v25.10.0');
  });
});
