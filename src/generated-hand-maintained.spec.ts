/**
 * The v25.10 entries no dump describes, asserted as still exported.
 *
 * `virt.*` and `pool.dataset.encryption_algorithm_choices` exist only because
 * someone put them there by hand: middleware deleted the `virt` models from
 * every version directory in b9c330ee94, and `pool.dataset.
 * encryption_algorithm_choices` went in 22ce5eac51, so no dump taken since
 * describes either. The API itself is unchanged — 25.10 is released.
 *
 * Regenerating v25.10 deletes them, and re-freezing afterwards means no later
 * run puts them back. That happened during this regeneration: the restore
 * covered `v25_10_0/` and missed the inherited re-exports in the five patch
 * directories, so 40 type names left each of them while `tsc`, `eslint` and the
 * whole suite stayed green. The directories still declared the *methods*, so
 * the versions claimed entries whose payload types they no longer exported.
 *
 * These assertions are what would have caught it. They are deliberately about
 * the re-export surface a consumer imports, not about the directory keys, since
 * the keys survived and the types did not.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type {
  v25_10_0, v25_10_1, v25_10_2, v25_10_3, v25_10_4, v25_10_5,
} from '@/generated';
// Imported from the declaring module, so the assertions below compare against
// the version's own shape rather than whatever the namespace happens to export.
import type { SharingSMBQueryResultItem as OwnSharingSMBQueryResultItem } from '@/generated/v25_10_1/api-types';
import type { CertificateQueryResultItem as OwnCertificateQueryResultItem } from '@/generated/v25_10_2/api-types';

describe('hand-maintained v25.10 surface', () => {
  it('declares the virt.* models at the chain root', () => {
    expectTypeOf<v25_10_0.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_0.VirtGlobalEntry>().toBeObject();
    expectTypeOf<v25_10_0.VirtVolumeEntry>().toBeObject();
    expectTypeOf<v25_10_0.PoolDatasetEncryptionAlgorithmChoicesResult>().toBeObject();
  });

  /**
   * One representative per version. The patch directories re-export the root's
   * types rather than declaring their own, so if the block is dropped again it
   * is dropped wholesale and any one name catches it.
   */
  it('re-exports them from every patch version', () => {
    expectTypeOf<v25_10_1.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_2.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_3.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_4.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_5.VirtInstanceEntry>().toBeObject();
    expectTypeOf<v25_10_5.PoolDatasetEncryptionAlgorithmChoicesResult>().toBeObject();
  });

  /**
   * Presence is not enough. Restoring a block by hand can also re-export a name
   * the version declares *itself*, and an explicit named re-export beats the
   * `export *` beside it — so the ancestor's shape wins and the version's own
   * declaration is shadowed. That is not a duplicate-identifier error; nothing
   * reports it. It happened here to `SharingSMBQueryResultItem`, whose v25.10.1
   * shape adds `FCP_SHARE`, leaving a version exporting a result type that could
   * not hold the result it returns.
   */
  it('resolves a redeclared type to the version that redeclared it', () => {
    expectTypeOf<v25_10_1.SharingSMBQueryResultItem>()
      .toEqualTypeOf<OwnSharingSMBQueryResultItem>();
    expectTypeOf<v25_10_2.CertificateQueryResultItem>()
      .toEqualTypeOf<OwnCertificateQueryResultItem>();
  });

  it('still routes the methods that use them', () => {
    expectTypeOf<v25_10_5.ApiCallDirectory['virt.instance.query']>().toBeObject();
    expectTypeOf<v25_10_5.ApiCallDirectory['pool.dataset.encryption_algorithm_choices']>().toBeObject();
  });
});
