import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateFromDump } from './lib/pipeline.mts';
import type { ApiDumpFile } from './lib/types.mts';

const loadFixture = async (): Promise<ApiDumpFile> => JSON.parse(
  await readFile(new URL('./fixtures/mini-dump.json', import.meta.url), 'utf8'),
) as ApiDumpFile;

const generate = async () => generateFromDump(await loadFixture(), { apiVersions: ['v1.0.0', 'v2.0.0'] });

describe('generateFromDump (mini fixture, v1 -> v2 chain)', () => {
  it('matches the golden snapshot', async () => {
    const files = await generate();
    expect(Object.fromEntries([...files.entries()].sort())).toMatchSnapshot();
  });

  it('is deterministic', async () => {
    expect(await generate()).toEqual(await generate());
  });

  it('declares changed types per version and inherits unchanged ones', async () => {
    const files = await generate();
    const v1 = files.get('v1_0_0/api-types.ts') ?? '';
    const v2 = files.get('v2_0_0/api-types.ts') ?? '';
    // TestEntry gained a field in v2: declared in both versions.
    expect(v1).toMatch(/^export interface TestEntry /m);
    expect(v2).toMatch(/^export interface TestEntry /m);
    expect(v2).toContain('extra_flag');
    // TestCreate is unchanged: declared at the root, re-exported by v2.
    expect(v1).toMatch(/^export interface TestCreate /m);
    expect(v2).not.toMatch(/^export interface TestCreate /m);
    expect(files.get('v2_0_0/index.ts')).toMatch(/^ {2}TestCreate,$/m);
  });

  it('re-declares transitively affected types (event model referencing TestEntry)', async () => {
    const files = await generate();
    expect(files.get('v1_0_0/api-types.ts')).toMatch(/^export interface TestChangedAddedEvent /m);
    expect(files.get('v2_0_0/api-types.ts')).toMatch(/^export interface TestChangedAddedEvent /m);
  });

  it('splits mode-diverging models into Name and NameInput', async () => {
    const v1 = (await generate()).get('v1_0_0/api-types.ts') ?? '';
    expect(v1).toMatch(/^export interface Widget /m);
    expect(v1).toMatch(/^export interface WidgetInput /m);
    expect(v1).toContain('computed'); // serialization render keeps the bare name
  });

  it('hoists inline titled enums and normalizes leading-lowercase names', async () => {
    const v1 = (await generate()).get('v1_0_0/api-types.ts') ?? '';
    expect(v1).toMatch(/^export const TagChoice = \{/m);
    expect(v1).toMatch(/^export const KindEnum = \{/m);
    expect(v1).toMatch(/^export interface ISCSIThing /m); // iSCSIThing normalized
  });

  it('types query methods with the grammar generics and prunes the options model', async () => {
    const files = await generate();
    for (const dir of ['v1_0_0', 'v2_0_0']) {
      const calls = files.get(`${dir}/api-call-directory.ts`) ?? '';
      expect(calls).toContain('filters?: QueryFilters<TestEntry>');
      expect(calls).toContain('options?: QueryOptions<TestEntry>');
    }
    for (const [, content] of files) {
      expect(content).not.toContain('QueryOptionsModel'); // orphaned and pruned
    }
  });

  it('hoists stable entries into directory bases and keeps changed ones per-version', async () => {
    const files = await generate();
    const base = files.get('shared/api-call-directory-base.ts') ?? '';
    const jobBase = files.get('shared/api-job-directory-base.ts') ?? '';
    expect(base).toContain("'iscsi.fetch':"); // identical everywhere, stable refs
    expect(jobBase).toContain("'test.run':");
    // test.create references TestEntry (changed in v2) -> must stay per-version.
    expect(base).not.toContain("'test.create':");
    expect(files.get('v1_0_0/api-call-directory.ts')).toContain("'test.create':");
    expect(files.get('v2_0_0/api-call-directory.ts')).toContain("'test.create':");
    // test.remove is new in v2.
    expect(files.get('v2_0_0/api-call-directory.ts')).toContain("'test.remove':");
    expect(files.get('v1_0_0/api-call-directory.ts')).not.toContain("'test.remove':");
  });

  it('marks removed_in methods as deprecated (entry is base-eligible, so in the base)', async () => {
    const base = (await generate()).get('shared/api-call-directory-base.ts') ?? '';
    expect(base).toContain("'test.update':");
    expect(base).toContain('@deprecated Removed in API version v3.0.0.');
  });

  it('rejects non-keep-refs dumps and unknown versions', async () => {
    const fixture = await loadFixture();
    await expect(generateFromDump({ versions: [{
      ...fixture.versions![0],
      methods: [{ ...fixture.versions![0].methods[0], schemas: { properties: {} } as never }],
    }] })).rejects.toThrow(/keep-refs/);
    await expect(generateFromDump(fixture, { apiVersions: ['v9.9.9'] })).rejects.toThrow(/No version v9\.9\.9/);
  });
});
