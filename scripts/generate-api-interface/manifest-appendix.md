<!--
Appended verbatim to the generated MANIFEST.md.

The generator derives history by diffing consecutive dumps, so anything absent
from every dump is invisible to it. Rows for such entries live here, where a
regeneration reproduces them instead of deleting them.
-->
## virt.* (hand-maintained)

The generator cannot see this namespace. Middleware removed `virt.*` in
`b9c330ee94` and that commit deleted the model files from every historical
version directory, so no `--dump-api` dump describes it and the diff the
generator derives history from has nothing on either side to compare. These
rows are transcribed by hand from tag `TS-25.10.5`, alongside the types
themselves in `v25_10_0/api-types.ts`.

Listed separately rather than merged into the tables above so it stays obvious
which rows a regeneration maintains and which it does not.

| Name | Kind | History |
|------|------|---------|
| virt.device.disk_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.device.gpu_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.device.nic_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.device.pci_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.device.usb_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.global.bridge_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.global.config | call | introduced v25.10.0; removed v27.0.0 |
| virt.global.get_network | call | introduced v25.10.0; removed v27.0.0 |
| virt.global.pool_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.device_add | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.device_delete | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.device_list | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.device_update | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.get_instance | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.image_choices | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.query | call | introduced v25.10.0; removed v27.0.0 |
| virt.instance.set_bootable_disk | call | introduced v25.10.0; removed v27.0.0 |
| virt.volume.create | call | introduced v25.10.0; removed v27.0.0 |
| virt.volume.delete | call | introduced v25.10.0; removed v27.0.0 |
| virt.volume.get_instance | call | introduced v25.10.0; removed v27.0.0 |
| virt.volume.query | call | introduced v25.10.0; removed v27.0.0 |
| virt.volume.update | call | introduced v25.10.0; removed v27.0.0 |
| virt.device.export_disk_image | job | introduced v25.10.0; removed v27.0.0 |
| virt.device.import_disk_image | job | introduced v25.10.0; removed v27.0.0 |
| virt.global.update | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.create | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.delete | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.restart | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.start | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.stop | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.update | job | introduced v25.10.0; removed v27.0.0 |
| virt.volume.import_iso | job | introduced v25.10.0; removed v27.0.0 |
| virt.volume.import_zvol | job | introduced v25.10.0; removed v27.0.0 |
| virt.instance.metrics | event | introduced v25.10.0; removed v27.0.0 |
| virt.instance.query | event | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceBase | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceCdrom | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceDisk | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceExportDiskImage | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceGpu | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceGpuChoice | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceImportDiskImage | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceNic | type | introduced v25.10.0; removed v27.0.0 |
| VirtDevicePci | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceProxy | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceTpm | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceType | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceUsb | type | introduced v25.10.0; removed v27.0.0 |
| VirtDeviceUsbChoice | type | introduced v25.10.0; removed v27.0.0 |
| VirtGlobalEntry | type | introduced v25.10.0; removed v27.0.0 |
| VirtGlobalNetwork | type | introduced v25.10.0; removed v27.0.0 |
| VirtGlobalUpdate | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceAddedEvent | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceAlias | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceChangedEvent | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceCreate | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceEntry | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceIdmapEntry | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceImage | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceImageChoice | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceQueryResultItem | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceRemovedEvent | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceStopOptions | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceUpdate | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstanceUserNsIdmap | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstancesMetricsEventSourceArgs | type | introduced v25.10.0; removed v27.0.0 |
| VirtInstancesMetricsEventSourceEvent | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeCreate | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeEntry | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeImportIso | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeImportZvol | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeImportZvolItem | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeQueryResultItem | type | introduced v25.10.0; removed v27.0.0 |
| VirtVolumeUpdate | type | introduced v25.10.0; removed v27.0.0 |

## pool.dataset.encryption_algorithm_choices (hand-maintained)

The generator cannot see this method either, for the same reason as `virt.*`:
`22ce5eac51` ("NAS-142001 / 27.0.0-BETA.1 / Stop discarding options passed to
pool.dataset.create") deleted `encryption_algorithm_choices` from
`plugins/pool_/dataset_info.py` and removed its models from `api/v26_0_0/` and
`api/v27_0_0/` in the same commit, so no `--dump-api` dump describes it at any
version — the 2026-07-27 dump had it in v25.10.0 through v27.0.0 and the
2026-08-14 dump has it nowhere.

Released 25.10 really serves it (`TS-25.10.5` carries it in
`plugins/pool_/dataset_info.py`), so it stays declared in `v25_10_0/`. It is
absent from the next release's branch — the method is gone from the plugin, not
merely from the versioned models, so a v25.10-pinned client talking to that
appliance will not find it either — hence removed at v27.0.0 via
`hand-removed.json`.

Middleware renumbered after that commit (`d3b89cea4d`: 26.0.0 -> 27.0.0 and
27.0.0 -> 28.0.0, 26 having never left prerelease), so the `api/v26_0_0/` and
`api/v27_0_0/` paths above are the names those directories had at `22ce5eac51`,
not the names they have now. The release itself did not change; only what it is
called. That is why these rows say v27.0.0 while the commit they cite talks
about v26.

| Name | Kind | History |
|------|------|---------|
| pool.dataset.encryption_algorithm_choices | call | introduced v25.10.0; removed v27.0.0 |
| PoolDatasetEncryptionAlgorithmChoicesResult | type | introduced v25.10.0; removed v27.0.0 |

## config.save defaults (hand-maintained)

No type here can carry this, which is why it is written down. At v28.0.0
middleware flipped the default of `ConfigSave.secretseed` from `false` to
`true`. `secretseed?: boolean` is emitted identically at every version — an
optional boolean has nowhere to put a default — so nothing a consumer imports
says this changed.

The consequence is caller-visible and worth knowing: at 28.0.0,
`config.save()` with no arguments writes the secret seed into the backup, where
at 25.10 and 27.0 the same call left it out. Middleware's own description for
the field is the warning to read — the seed decrypts every password, private
key and API key the backup contains, so a backup that includes it is itself a
secret. Pass `{ secretseed: false }` to get the old behaviour, bearing in mind
middleware also states that a backup saved without the seed cannot be
uploaded.

The flip was first recorded here as landing at v27.0.0, which it did under the
numbering of the time; middleware's renumber (`d3b89cea4d`) moved that release
to v28.0.0 and the note with it.

Listed here rather than in the tables above because there is no entry to list:
`config.save` is unchanged in every version's directory, and `ConfigSave` is
unchanged as a type.

This file is not in the published package — `files` is `["dist"]` and nothing
copies it there — so it reaches people reading this repository, not people who
install `@truenas/api-client`. The README is in the tarball, and carries the
same note for them.
