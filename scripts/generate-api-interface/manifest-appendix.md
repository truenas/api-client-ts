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
| virt.device.disk_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.device.gpu_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.device.nic_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.device.pci_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.device.usb_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.global.bridge_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.global.config | call | introduced v25.10.0; removed v26.0.0 |
| virt.global.get_network | call | introduced v25.10.0; removed v26.0.0 |
| virt.global.pool_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.device_add | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.device_delete | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.device_list | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.device_update | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.get_instance | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.image_choices | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.query | call | introduced v25.10.0; removed v26.0.0 |
| virt.instance.set_bootable_disk | call | introduced v25.10.0; removed v26.0.0 |
| virt.volume.create | call | introduced v25.10.0; removed v26.0.0 |
| virt.volume.delete | call | introduced v25.10.0; removed v26.0.0 |
| virt.volume.get_instance | call | introduced v25.10.0; removed v26.0.0 |
| virt.volume.query | call | introduced v25.10.0; removed v26.0.0 |
| virt.volume.update | call | introduced v25.10.0; removed v26.0.0 |
| virt.device.export_disk_image | job | introduced v25.10.0; removed v26.0.0 |
| virt.device.import_disk_image | job | introduced v25.10.0; removed v26.0.0 |
| virt.global.update | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.create | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.delete | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.restart | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.start | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.stop | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.update | job | introduced v25.10.0; removed v26.0.0 |
| virt.volume.import_iso | job | introduced v25.10.0; removed v26.0.0 |
| virt.volume.import_zvol | job | introduced v25.10.0; removed v26.0.0 |
| virt.instance.metrics | event | introduced v25.10.0; removed v26.0.0 |
| virt.instance.query | event | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceBase | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceCdrom | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceDisk | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceExportDiskImage | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceGpu | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceGpuChoice | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceImportDiskImage | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceNic | type | introduced v25.10.0; removed v26.0.0 |
| VirtDevicePci | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceProxy | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceTpm | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceType | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceUsb | type | introduced v25.10.0; removed v26.0.0 |
| VirtDeviceUsbChoice | type | introduced v25.10.0; removed v26.0.0 |
| VirtGlobalEntry | type | introduced v25.10.0; removed v26.0.0 |
| VirtGlobalNetwork | type | introduced v25.10.0; removed v26.0.0 |
| VirtGlobalUpdate | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceAddedEvent | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceAlias | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceChangedEvent | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceCreate | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceEntry | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceIdmapEntry | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceImage | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceImageChoice | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceQueryResultItem | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceRemovedEvent | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceStopOptions | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceUpdate | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstanceUserNsIdmap | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstancesMetricsEventSourceArgs | type | introduced v25.10.0; removed v26.0.0 |
| VirtInstancesMetricsEventSourceEvent | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeCreate | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeEntry | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeImportIso | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeImportZvol | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeImportZvolItem | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeQueryResultItem | type | introduced v25.10.0; removed v26.0.0 |
| VirtVolumeUpdate | type | introduced v25.10.0; removed v26.0.0 |
